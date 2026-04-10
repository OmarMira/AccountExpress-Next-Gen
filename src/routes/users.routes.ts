// ============================================================
// USERS ROUTES
// CRUD de usuarios + gestión de roles por tenant.
// Requiere sesión activa + permiso users:manage.
// ============================================================

import { Elysia, t } from "elysia";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import { requirePermission } from "../middleware/rbac.middleware.ts";
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";
import {
  listUsers,
  listRoles,
  createUser,
  updateUser,
  assignRole,
} from "../services/users.service.ts";
import { hashPassword } from "../services/auth.service.ts";
import { db } from "../db/connection.ts";
import { users, userCompanyRoles } from "../db/schema/index.ts";
import { eq, and, isNull } from "drizzle-orm";

export const usersRoutes = new Elysia({ prefix: "/users" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })

  // ── GET /users?companyId=xxx ──────────────────────────────
  .get("/", async ({ query }) => {
    const users = await listUsers(query.companyId);
    return { success: true, data: users };
  }, {
    query: t.Object({
      companyId: t.String()
    })
  })

  // ── GET /users/roles ──────────────────────────────────────
  .get("/roles", async () => {
    return { success: true, data: await listRoles() };
  })

  // ── POST /users ───────────────────────────────────────────
  .post("/", async ({ body, set, user }) => {
    const uid = user!;
    const { username, email, password, firstName, lastName, companyId, roleId } = body;

    try {
      const result = await createUser({
        username, email, password,
        firstName, lastName,
        companyId, roleId,
        grantedBy: uid,
      });
      set.status = 201;
      return { success: true, data: result };
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("UNIQUE")) {
        set.status = 409;
        return { success: false, error: "Username or email already exists" };
      }
      set.status = 500;
      return { success: false, error: "Internal error" };
    }
  }, {
    body: t.Object({
      username:  t.String({ minLength: 1 }),
      email:     t.String(),
      password:  t.String({ minLength: 8 }),
      firstName: t.String({ minLength: 1 }),
      lastName:  t.String({ minLength: 1 }),
      companyId: t.String(),
      roleId:    t.String(),
    }),
  })

  // ── PATCH /users/:userId ──────────────────────────────────
  .patch("/:userId", async ({ params, body, set, user, companyId: sessionCompanyId }) => {
    const uid = user!;
    const [callerUser] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);

    if (!callerUser?.isSuperAdmin) {
      const payload = body;
      const companyId = payload.companyId ?? sessionCompanyId;
      if (!companyId) { set.status = 403; return { success: false, error: "Forbidden" }; }
      const [adminRole] = await db
        .select({ roleId: userCompanyRoles.roleId })
        .from(userCompanyRoles)
        .where(
          and(
            eq(userCompanyRoles.userId, uid),
            eq(userCompanyRoles.companyId, companyId),
            eq(userCompanyRoles.isActive, true),
            isNull(userCompanyRoles.revokedAt)
          )
        )
        .limit(1);
      if (!adminRole) { set.status = 403; return { success: false, error: "Forbidden: admin role required" }; }
    }

    const payload = body;
    const result = await updateUser({
      userId: params.userId,
      ...payload,
      grantedBy: uid,
    });

    return { success: true, data: result };
  }, {
    params: t.Object({
      userId: t.String()
    }),
    body: t.Object({
      isActive:  t.Optional(t.Boolean()),
      firstName: t.Optional(t.String({ minLength: 1 })),
      lastName:  t.Optional(t.String({ minLength: 1 })),
      username:  t.Optional(t.String({ minLength: 1 })),
      email:     t.Optional(t.String()),
      password:  t.Optional(t.String({ minLength: 8 })),
      companyId: t.Optional(t.String()),
      roleId:    t.Optional(t.String()),
    }),
  })

  // ── PUT /users/:userId/role ───────────────────────────────
  .put("/:userId/role", async ({ params, body, set, user }) => {
    const uid = user!;
    const [callerUser] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);

    const { companyId, roleId } = body;
    if (!callerUser?.isSuperAdmin) {
      if (!companyId) { set.status = 403; return { success: false, error: "Forbidden" }; }
      const [adminRole] = await db
        .select({ roleId: userCompanyRoles.roleId })
        .from(userCompanyRoles)
        .where(
          and(
            eq(userCompanyRoles.userId, uid),
            eq(userCompanyRoles.companyId, companyId),
            eq(userCompanyRoles.isActive, true),
            isNull(userCompanyRoles.revokedAt)
          )
        )
        .limit(1);
      if (!adminRole) { set.status = 403; return { success: false, error: "Forbidden: admin role required" }; }
    }
    if (!companyId || !roleId) {
      set.status = 400;
      return { success: false, error: "companyId and roleId required" };
    }

    const result = await assignRole({
      userId: params.userId,
      companyId,
      roleId,
      grantedBy: uid,
    });

    return { success: true, data: result };
  }, {
    params: t.Object({
      userId: t.String()
    }),
    body: t.Object({
      companyId: t.String(),
      roleId:    t.String(),
    }),
  })

  // ── POST /users/:userId/reset-password ────────────────────
  .post("/:userId/reset-password", async ({ params, body, set, user }) => {
    const uid = user!;
    const [callerUser] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);

    if (!callerUser?.isSuperAdmin) {
      set.status = 403;
      return { success: false, error: "Forbidden: super_admin only" };
    }

    const { newPassword } = body;
    const { hash } = await hashPassword(newPassword);

    await db.update(users)
      .set({
        passwordHash:       hash,
        mustChangePassword: true,
        failedAttempts:     0,
        isLocked:           false,
        lockedUntil:        null,
        updatedAt:          new Date(),
      })
      .where(eq(users.id, params.userId));

    return { success: true, message: "Password reset. User must change it on next login." };
  }, {
    params: t.Object({
      userId: t.String()
    }),
    body: t.Object({
      newPassword: t.String({ minLength: 8 }),
    }),
  });
