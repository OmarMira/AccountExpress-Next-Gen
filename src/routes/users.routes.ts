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

    const { username, email, password, firstName, lastName, companyId, roleId } = body as any;

    if (!username || !email || !password || !firstName || !lastName || !companyId || !roleId) {
      set.status = 400;
      return { success: false, error: "All fields required" };
    }

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
      const payload = body as any;
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

    const payload = body as any;
    const result = await updateUser({
      userId: params.userId,
      ...payload,
    });

    return { success: true, data: result };
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

    const { companyId, roleId } = body as any;
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
  });
