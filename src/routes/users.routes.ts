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
  listAllUsers,
  createUser,
  updateUser,
  assignRole,
  deleteUser,
} from "../services/users.service.ts";
import { hashPassword } from "../services/auth.service.ts";
import { db } from "../db/connection.ts";
import { users, userCompanyRoles } from "../db/schema/index.ts";
import { eq, and, isNull } from "drizzle-orm";

export const usersRoutes = new Elysia({ prefix: "/users" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })

  // ── GET /users/roles ──────────────────────────────────────
  .get("/roles", async () => {
    return { success: true, data: await listRoles() };
  })

  // ── GET /users/all (super admin only) ────────────────────
  .get("/all", async ({ user, set }) => {
    const uid = user!;
    const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, uid)).limit(1);
    if (!dbUser?.isSuperAdmin) {
      set.status = 403;
      return { success: false, error: "Super Admin privileges required" };
    }
    return { success: true, data: await listAllUsers() };
  })

  // ── GET /users ──────────────────────────────
  .use(requirePermission("users", "read"))
  .get("/", async ({ companyId, set }) => {
    if (!companyId) {
      set.status = 403;
      return { success: false, error: "No active company" };
    }
    const usersData = await listUsers(companyId);
    return { success: true, data: usersData };
  })

  .use(requirePermission("users", "write"))

  // ── POST /users ───────────────────────────────────────────
  .post("/", async ({ body, set, user, companyId }) => {
    if (!companyId) {
      set.status = 403;
      return { success: false, error: "No active company" };
    }

    const uid = user!;
    const { username, email, password, firstName, lastName, roleId } = body;

    let actualRoleId = roleId;
    if (actualRoleId === 'admin') actualRoleId = 'role-company-admin-00-000000000002';
    if (actualRoleId === 'viewer') actualRoleId = 'role-auditor-000000-000000000004';

    try {
      const result = await createUser({
        username, email, password,
        firstName, lastName,
        companyId: companyId, 
        roleId: actualRoleId,
        grantedBy: uid,
      });
      set.status = 201;
      return { success: true, data: result };
    } catch (err: any) {
      const isUnique = err?.code === '23505' || String(err).includes('23505') || String(err).includes('unique constraint');
      if (isUnique) {
        set.status = 409;
        return { success: false, error: "El nombre de usuario o correo electrónico ya está en uso." };
      }
      set.status = 500;
      return { success: false, error: "Error interno del servidor al crear usuario." };
    }
  }, {
    body: t.Object({
      username:  t.String({ minLength: 1 }),
      email:     t.String(),
      password:  t.String({ minLength: 8 }),
      firstName: t.String({ minLength: 1 }),
      lastName:  t.String({ minLength: 1 }),
      roleId:    t.String(),
    }, { additionalProperties: false }),
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
      if (!sessionCompanyId) { set.status = 403; return { success: false, error: "Forbidden" }; }
      
      const [adminRole] = await db
        .select({ roleId: userCompanyRoles.roleId })
        .from(userCompanyRoles)
        .where(
          and(
            eq(userCompanyRoles.userId, uid),
            eq(userCompanyRoles.companyId, sessionCompanyId),
            eq(userCompanyRoles.isActive, true),
            isNull(userCompanyRoles.revokedAt)
          )
        )
        .limit(1);
      
      if (!adminRole) { set.status = 403; return { success: false, error: "Forbidden: admin role required" }; }

      // Verify that the target user belongs to the sessionCompanyId
      const [membership] = await db
        .select({ userId: userCompanyRoles.userId })
        .from(userCompanyRoles)
        .where(
          and(
            eq(userCompanyRoles.userId, params.userId),
            eq(userCompanyRoles.companyId, sessionCompanyId),
            eq(userCompanyRoles.isActive, true),
            isNull(userCompanyRoles.revokedAt)
          )
        )
        .limit(1);

      if (!membership) {
        set.status = 403;
        return { success: false, error: 'Acceso denegado' };
      }
    }

    const payload = body;
    if (payload.roleId === 'admin') payload.roleId = 'role-company-admin-00-000000000002';
    if (payload.roleId === 'viewer') payload.roleId = 'role-auditor-000000-000000000004';

    try {
      const result = await updateUser({
        userId: params.userId,
        ...payload,
        grantedBy: uid,
      });
      return { success: true, data: result };
    } catch (err: any) {
      const isUnique = err?.code === '23505' || String(err).includes('23505') || String(err).includes('unique constraint');
      if (isUnique) {
        set.status = 409;
        return { success: false, error: "El nombre de usuario o correo electrónico ya está en uso." };
      }
      set.status = 500;
      return { success: false, error: "Error interno del servidor al actualizar perfil." };
    }
  }, {
    params: t.Object({
      userId: t.String()
    }, { additionalProperties: false }),
    body: t.Object({
      isActive:  t.Optional(t.Boolean()),
      firstName: t.Optional(t.String({ minLength: 1 })),
      lastName:  t.Optional(t.String({ minLength: 1 })),
      username:  t.Optional(t.String({ minLength: 1 })),
      email:     t.Optional(t.String()),
      password:  t.Optional(t.String({ minLength: 8 })),
      roleId:    t.Optional(t.String()),
    }, { additionalProperties: false }),
  })

  // ── PUT /users/:userId/role ───────────────────────────────
  .put("/:userId/role", async ({ params, body, set, user, companyId: sessionCompanyId }) => {
    const uid = user!;
    const [callerUser] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);

    const { companyId, roleId } = body;
    if (!callerUser?.isSuperAdmin) {
      if (!sessionCompanyId) { set.status = 403; return { success: false, error: "Forbidden" }; }
      const [adminRole] = await db
        .select({ roleId: userCompanyRoles.roleId })
        .from(userCompanyRoles)
        .where(
          and(
            eq(userCompanyRoles.userId, uid),
            eq(userCompanyRoles.companyId, sessionCompanyId),
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

    let actualRoleId = roleId;
    if (actualRoleId === 'admin') actualRoleId = 'role-company-admin-00-000000000002';
    if (actualRoleId === 'viewer') actualRoleId = 'role-auditor-000000-000000000004';

    const result = await assignRole({
      userId: params.userId,
      companyId,
      roleId: actualRoleId,
      grantedBy: uid,
    });

    return { success: true, data: result };
  }, {
    params: t.Object({
      userId: t.String()
    }, { additionalProperties: false }),
    body: t.Object({
      companyId: t.String(),
      roleId:    t.String(),
    }, { additionalProperties: false }),
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
    }, { additionalProperties: false }),
    body: t.Object({
      newPassword: t.String({ minLength: 8 }),
    }, { additionalProperties: false }),
  })
  
  // ── DELETE /users/:userId ────────────────────────────────
  .delete("/:userId", async ({ params, set, user }) => {
    const callerId = user!;
    
    // 1. Solo un Super Admin puede borrar físicamente.
    const [caller] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, callerId)).limit(1);
    if (!caller?.isSuperAdmin) {
      set.status = 403;
      return { success: false, error: "Privilegios de Súper Administrador requeridos para el borrado físico." };
    }

    // 2. Un Super Admin no se puede borrar a sí mismo.
    if (params.userId === callerId) {
      set.status = 400;
      return { success: false, error: "No puedes eliminar tu propia cuenta." };
    }

    try {
      await deleteUser(params.userId);
      return { success: true, message: "User permanently deleted" };
    } catch (err: any) {
      set.status = 400;
      return { success: false, error: err.message || "Failed to delete user" };
    }
  }, {
    params: t.Object({
      userId: t.String()
    }, { additionalProperties: false })
  });
