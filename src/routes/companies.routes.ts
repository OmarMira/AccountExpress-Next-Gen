// ============================================================
// COMPANIES ROUTES
// Endpoints to manage companies and their isolated users.
// ============================================================

import { Elysia, t } from "elysia";
import { rawDb } from "../db/connection.ts";
import { 
  createCompany, 
  updateCompany, 
  archiveCompany, 
  listCompanies,
  addUserToCompany,
  revokeUserFromCompany,
  listCompanyUsers
} from "../services/companies.service.ts";
import { createAuditEntry } from "../services/audit.service.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";

export const companiesRoutes = new Elysia({ prefix: "/companies" })
  .use(authMiddleware)

  // ── GET /companies ──────────────────────────────────────────
  .get("/", ({ user }) => {
    const isSuper = rawDb.query("SELECT is_super_admin FROM users WHERE id = ?").get(user) as any;
    const isSuperAdmin = isSuper && isSuper.is_super_admin === 1;
    return listCompanies(user, isSuperAdmin);
  })

  // ── POST /companies ─────────────────────────────────────────
  .post(
    "/",
    ({ body, user, sessionId, request, set }) => {
      const isSuper = rawDb.query("SELECT is_super_admin FROM users WHERE id = ?").get(user) as any;
      if (!isSuper || isSuper.is_super_admin !== 1) {
        set.status = 403; return { error: "Super Admin privileges required" };
      }

      const companyId = createCompany(body);
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";

      createAuditEntry({
        companyId: companyId, userId: user, sessionId,
        action: "companies:create", module: "companies",
        entityType: "company", entityId: companyId,
        beforeState: null, afterState: body, ipAddress: ip,
      });

      set.status = 201;
      return { id: companyId, message: "Company created" };
    },
    {
      body: t.Object({
        legalName: t.String({ minLength: 1 }),
        tradeName: t.Optional(t.String()),
        ein: t.Optional(t.String()),
        address: t.Optional(t.String()),
        city: t.Optional(t.String()),
        state: t.Optional(t.String()),
        zipCode: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        fiscalYearStart: t.String(),
        currency: t.String(),
      })
    }
  )

  // ── PUT /companies/:id ──────────────────────────────────────
  .put(
    "/:id",
    ({ params, body, user, sessionId, request, set }) => {
      const isSuper = rawDb.query("SELECT is_super_admin FROM users WHERE id = ?").get(user) as any;
      const isSuperAdmin = isSuper && isSuper.is_super_admin === 1;

      if (!isSuperAdmin) {
        const role = rawDb.query("SELECT * FROM user_company_roles WHERE user_id = ? AND company_id = ? AND is_active = 1 AND revoked_at IS NULL").get(user, params.id);
        if (!role) {
          set.status = 403; return { error: "Access denied" };
        }
      }

      updateCompany(params.id, body);
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      createAuditEntry({
        companyId: params.id, userId: user, sessionId,
        action: "companies:update", module: "companies",
        entityType: "company", entityId: params.id,
        beforeState: null, afterState: body, ipAddress: ip,
      });

      return { message: "Company updated" };
    },
    {
      body: t.Partial(t.Object({
        legalName: t.String(),
        tradeName: t.Optional(t.String()),
        ein: t.Optional(t.String()),
        address: t.Optional(t.String()),
        city: t.Optional(t.String()),
        state: t.Optional(t.String()),
        zipCode: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
        fiscalYearStart: t.String(),
        currency: t.String(),
      }))
    }
  )

  // ── DELETE /companies/:id ───────────────────────────────────
  .delete(
    "/:id",
    ({ params, user, sessionId, request, set }) => {
      const isSuper = rawDb.query("SELECT is_super_admin FROM users WHERE id = ?").get(user) as any;
      if (!isSuper || isSuper.is_super_admin !== 1) {
        set.status = 403; return { error: "Super Admin privileges required" };
      }

      archiveCompany(params.id);
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      createAuditEntry({
        companyId: params.id, userId: user, sessionId,
        action: "companies:delete", module: "companies",
        entityType: "company", entityId: params.id,
        beforeState: null, afterState: { is_active: 0 }, ipAddress: ip,
      });

      return { message: "Company archived" };
    }
  )

  // ── GET /companies/:id/users ────────────────────────────────
  .get("/:id/users", ({ params, user, set }) => {
    const isSuper = rawDb.query("SELECT is_super_admin FROM users WHERE id = ?").get(user) as any;
    const isSuperAdmin = isSuper && isSuper.is_super_admin === 1;

    if (!isSuperAdmin) {
      const role = rawDb.query("SELECT * FROM user_company_roles WHERE user_id = ? AND company_id = ? AND is_active = 1 AND revoked_at IS NULL").get(user, params.id);
      if (!role) {
        set.status = 403; return { error: "Access denied" };
      }
    }
    return listCompanyUsers(params.id);
  })

  // ── POST /companies/:id/users ───────────────────────────────
  .post(
    "/:id/users",
    ({ params, body, user, sessionId, request, set }) => {
      const isSuper = rawDb.query("SELECT is_super_admin FROM users WHERE id = ?").get(user) as any;
      const isSuperAdmin = isSuper && isSuper.is_super_admin === 1;

      if (!isSuperAdmin) {
        const role = rawDb.query("SELECT * FROM user_company_roles WHERE user_id = ? AND company_id = ? AND is_active = 1 AND revoked_at IS NULL").get(user, params.id);
        if (!role) {
          set.status = 403; return { error: "Access denied" };
        }
      }

      try {
        const ucrId = addUserToCompany(params.id, body.userId, body.roleId, user);
        
        const ip = request.headers.get("x-forwarded-for") ?? "unknown";
        createAuditEntry({
          companyId: params.id, userId: user, sessionId,
          action: "company_users:create", module: "companies",
          entityType: "user_company_roles", entityId: ucrId,
          beforeState: null, afterState: { targetUserId: body.userId, roleId: body.roleId }, ipAddress: ip,
        });

        set.status = 201;
        return { id: ucrId, message: "User added to company" };
      } catch (e: any) {
        set.status = 400;
        return { error: e.message };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
        roleId: t.String()
      })
    }
  )

  // ── DELETE /companies/:id/users/:userId ─────────────────────
  .delete(
    "/:id/users/:userId",
    ({ params, user, sessionId, request, set }) => {
      const isSuper = rawDb.query("SELECT is_super_admin FROM users WHERE id = ?").get(user) as any;
      const isSuperAdmin = isSuper && isSuper.is_super_admin === 1;

      if (!isSuperAdmin) {
        const role = rawDb.query("SELECT * FROM user_company_roles WHERE user_id = ? AND company_id = ? AND is_active = 1 AND revoked_at IS NULL").get(user, params.id);
        if (!role) {
          set.status = 403; return { error: "Access denied" };
        }
      }

      try {
        revokeUserFromCompany(params.id, params.userId);
        
        const ip = request.headers.get("x-forwarded-for") ?? "unknown";
        createAuditEntry({
          companyId: params.id, userId: user, sessionId,
          action: "company_users:revoke", module: "companies",
          entityType: "user_company_roles", entityId: params.userId,
          beforeState: null, afterState: { revoked: true }, ipAddress: ip,
        });

        return { message: "User access revoked" };
      } catch (e: any) {
        set.status = 400;
        return { error: e.message };
      }
    }
  );

