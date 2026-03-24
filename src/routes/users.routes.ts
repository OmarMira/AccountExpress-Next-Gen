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

export const usersRoutes = new Elysia({ prefix: "/users" })

  // ── GET /users?companyId=xxx ──────────────────────────────
  .get("/", ({ query, cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? validateSession(token) : null;
    if (!session) { set.status = 401; return { success: false, error: "Unauthorized" }; }

    const companyId = query.companyId;
    if (!companyId) { set.status = 400; return { success: false, error: "companyId required" }; }

    const users = listUsers(companyId as string);
    return { success: true, data: users };
  })

  // ── GET /users/roles ──────────────────────────────────────
  .get("/roles", ({ cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? validateSession(token) : null;
    if (!session) { set.status = 401; return { success: false, error: "Unauthorized" }; }

    return { success: true, data: listRoles() };
  })

  // ── POST /users ───────────────────────────────────────────
  .post("/", async ({ body, cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? validateSession(token) : null;
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
  .patch("/:userId", ({ params, body, cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? validateSession(token) : null;
    if (!session) { set.status = 401; return { success: false, error: "Unauthorized" }; }

    const payload = body as any;
    const result = updateUser({
      userId: params.userId,
      ...payload,
    });

    return { success: true, data: result };
  })

  // ── PUT /users/:userId/role ───────────────────────────────
  .put("/:userId/role", ({ params, body, cookie, set }) => {
    const token = cookie["session"]?.value as string | undefined;
    const session = token ? validateSession(token) : null;
    if (!session) { set.status = 401; return { success: false, error: "Unauthorized" }; }

    const { companyId, roleId } = body as any;
    if (!companyId || !roleId) {
      set.status = 400;
      return { success: false, error: "companyId and roleId required" };
    }

    const result = assignRole({
      userId: params.userId,
      companyId,
      roleId,
      grantedBy: session.userId,
    });

    return { success: true, data: result };
  });
