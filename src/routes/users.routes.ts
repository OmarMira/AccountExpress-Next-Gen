// ============================================================
// USERS ROUTES
// CRUD de usuarios + gestión de roles por tenant.
// Requiere sesión activa + permiso users:manage.
// ============================================================

import { Elysia, t } from "elysia";
import { validateSession } from "../services/session.service.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";
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

  // ── GET /users?companyId=xxx ──────────────────────────────
  .get("/", async ({ query, cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? await validateSession(token) : null;
    if (!session) { set.status = 401; return { success: false, error: "Unauthorized" }; }

    const companyId = query.companyId;
    if (!companyId) { set.status = 400; return { success: false, error: "companyId required" }; }

    const users = await listUsers(companyId as string);
    return { success: true, data: users };
  })

  // ── GET /users/roles ──────────────────────────────────────
  .get("/roles", async ({ cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? await validateSession(token) : null;
    if (!session) { set.status = 401; return { success: false, error: "Unauthorized" }; }

    return { success: true, data: await listRoles() };
  })

  // ── POST /users ───────────────────────────────────────────
  .post("/", async ({ body, cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? await validateSession(token) : null;
    if (!session) { set.status = 401; return { success: false, error: "Unauthorized" }; }

    const { username, email, password, firstName, lastName, companyId, roleId } = body;

    try {
      const result = await createUser({
        username, email, password,
        firstName, lastName,
        companyId, roleId,
        grantedBy: session.userId,
      });
      set.status = 201;
      return { success: true, data: result };
    } catch (err: any) {
      if (err?.message?.includes("UNIQUE")) {
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
  .patch("/:userId", async ({ params, body, cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? await validateSession(token) : null;
    if (!session) { set.status = 401; return { success: false, error: "Unauthorized" }; }

    const [callerUser] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!callerUser?.isSuperAdmin) {
      const payload = body;
      const companyId = payload.companyId ?? session.companyId;
      if (!companyId) { set.status = 403; return { success: false, error: "Forbidden" }; }
      const [adminRole] = await db
        .select({ roleId: userCompanyRoles.roleId })
        .from(userCompanyRoles)
        .where(
          and(
            eq(userCompanyRoles.userId, session.userId),
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
    });

    return { success: true, data: result };
  }, {
    body: t.Object({
      isActive:  t.Optional(t.Boolean()),
      firstName: t.Optional(t.String({ minLength: 1 })),
      lastName:  t.Optional(t.String({ minLength: 1 })),
      email:     t.Optional(t.String()),
      companyId: t.Optional(t.String()),
    }),
  })

  // ── PUT /users/:userId/role ───────────────────────────────
  .put("/:userId/role", async ({ params, body, cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? await validateSession(token) : null;
    if (!session) { set.status = 401; return { success: false, error: "Unauthorized" }; }

    const [callerUser] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    const { companyId, roleId } = body;
    if (!callerUser?.isSuperAdmin) {
      if (!companyId) { set.status = 403; return { success: false, error: "Forbidden" }; }
      const [adminRole] = await db
        .select({ roleId: userCompanyRoles.roleId })
        .from(userCompanyRoles)
        .where(
          and(
            eq(userCompanyRoles.userId, session.userId),
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
      grantedBy: session.userId,
    });

    return { success: true, data: result };
  }, {
    body: t.Object({
      companyId: t.String(),
      roleId:    t.String(),
    }),
  })

  // ── POST /users/:userId/reset-password ────────────────────
  .post("/:userId/reset-password", async ({ params, body, cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? await validateSession(token) : null;
    if (!session) { set.status = 401; return { success: false, error: "Unauthorized" }; }

    const [callerUser] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, session.userId))
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
    body: t.Object({
      newPassword: t.String({ minLength: 8 }),
    }),
  });
