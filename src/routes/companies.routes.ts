// ============================================================
// COMPANIES ROUTES — PostgreSQL 16 / Drizzle ORM
// Endpoints to manage companies and their isolated users.
// ============================================================

import { Elysia, t } from "elysia";
import { db } from "../db/connection.ts";
import { users, userCompanyRoles } from "../db/schema/index.ts";
import { eq, and, isNull } from "drizzle-orm";
import { 
  createCompany, 
  updateCompany, 
  archiveCompany, 
  deleteCompany,
  listCompanies,
  addUserToCompany,
  revokeUserFromCompany,
  listCompanyUsers
} from "../services/companies.service.ts";
import { createAuditEntry } from "../services/audit.service.ts";
import { authMiddleware, requireAuth } from "../middleware/auth.middleware.ts";

export const companiesRoutes = new Elysia({ prefix: "/companies" })
  .use(authMiddleware)
  .onBeforeHandle(requireAuth)

  // ── GET /companies ──────────────────────────────────────────
  .get("/", async ({ user }) => {
    const uid = user!;
    const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, uid)).limit(1);
    const isSuperAdmin = dbUser?.isSuperAdmin === true;
    return await listCompanies(uid, isSuperAdmin);
  })

  // ── POST /companies ─────────────────────────────────────────
  .post(
    "/",
    async ({ body, user, sessionId, request, set }) => {
      const uid = user!;
      const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, uid)).limit(1);
      if (!dbUser || !dbUser.isSuperAdmin) {
        set.status = 403; return { error: "Super Admin privileges required" };
      }

      const companyId = await createCompany(body);
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";

      await createAuditEntry({
        companyId: companyId, userId: uid, sessionId,
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
    async ({ params, body, user, sessionId, request, set }) => {
      const uid = user!;
      const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, uid)).limit(1);
      const isSuperAdmin = dbUser?.isSuperAdmin === true;

      if (!isSuperAdmin) {
        const [role] = await db
          .select()
          .from(userCompanyRoles)
          .where(
            and(
              eq(userCompanyRoles.userId, uid),
              eq(userCompanyRoles.companyId, params.id),
              eq(userCompanyRoles.isActive, true),
              isNull(userCompanyRoles.revokedAt)
            )
          )
          .limit(1);
          
        if (!role) {
          set.status = 403; return { error: "Access denied" };
        }
      }

      await updateCompany(params.id, body);
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      await createAuditEntry({
        companyId: params.id, userId: uid, sessionId,
        action: "companies:update", module: "companies",
        entityType: "company", entityId: params.id,
        beforeState: null, afterState: body, ipAddress: ip,
      });

      return { message: "Company updated" };
    },
    {
      params: t.Object({
        id: t.String()
      }),
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
    async ({ params, user, sessionId, request, set }) => {
      const uid = user!;
      const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, uid)).limit(1);
      if (!dbUser || !dbUser.isSuperAdmin) {
        set.status = 403; return { error: "Super Admin privileges required" };
      }

      await archiveCompany(params.id);
      
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      await createAuditEntry({
        companyId: params.id, userId: uid, sessionId,
        action: "companies:archive", module: "companies",
        entityType: "company", entityId: params.id,
        beforeState: { isActive: true }, afterState: { isActive: false }, ipAddress: ip,
      });

      return { message: "Company archived" };
    },
    {
      params: t.Object({
        id: t.String()
      })
    }
  )

  // ── DELETE /companies/:id/purge ─────────────────────────────
  .delete(
    "/:id/purge",
    async ({ params, user, sessionId, request, set }) => {
      const uid = user!;
      const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, uid)).limit(1);
      if (!dbUser || !dbUser.isSuperAdmin) {
        set.status = 403; return { error: "Super Admin privileges required" };
      }

      try {
        await deleteCompany(params.id);
        const ip = request.headers.get("x-forwarded-for") ?? "unknown";
        await createAuditEntry({
          companyId: params.id, userId: uid, sessionId,
          action: "companies:purge", module: "companies",
          entityType: "company", entityId: params.id,
          beforeState: { purged: false }, afterState: { purged: true }, ipAddress: ip,
        });

        return { message: "Company permanently deleted" };
      } catch (err: any) {
        set.status = 400;
        return { error: err.message || "Failed to delete company" };
      }
    },
    {
      params: t.Object({
        id: t.String()
      })
    }
  )

  // ── GET /companies/:id/users ────────────────────────────────
  .get("/:id/users", async ({ params, user, set }) => {
    const uid = user!;
    const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, uid)).limit(1);
    const isSuperAdmin = dbUser?.isSuperAdmin === true;

    if (!isSuperAdmin) {
      const [role] = await db
        .select()
        .from(userCompanyRoles)
        .where(
          and(
            eq(userCompanyRoles.userId, uid),
            eq(userCompanyRoles.companyId, params.id),
            eq(userCompanyRoles.isActive, true),
            isNull(userCompanyRoles.revokedAt)
          )
        )
        .limit(1);

      if (!role) {
        set.status = 403; return { error: "Access denied" };
      }
    }
    return await listCompanyUsers(params.id);
  }, {
    params: t.Object({
      id: t.String()
    })
  })

  // ── POST /companies/:id/users ───────────────────────────────
  .post(
    "/:id/users",
    async ({ params, body, user, sessionId, request, set }) => {
      const uid = user!;
      const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, uid)).limit(1);
      const isSuperAdmin = dbUser?.isSuperAdmin === true;

      if (!isSuperAdmin) {
        const [role] = await db
          .select()
          .from(userCompanyRoles)
          .where(
            and(
              eq(userCompanyRoles.userId, uid),
              eq(userCompanyRoles.companyId, params.id),
              eq(userCompanyRoles.isActive, true),
              isNull(userCompanyRoles.revokedAt)
            )
          )
          .limit(1);

        if (!role) {
          set.status = 403; return { error: "Access denied" };
        }
      }

      const ucrId = await addUserToCompany(params.id, body.userId, body.roleId, uid);
        
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      await createAuditEntry({
        companyId: params.id, userId: uid, sessionId,
        action: "company_users:create", module: "companies",
        entityType: "user_company_roles", entityId: ucrId,
        beforeState: null, afterState: { targetUserId: body.userId, roleId: body.roleId }, ipAddress: ip,
      });

      set.status = 201;
      return { id: ucrId, message: "User added to company" };
    },
    {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        userId: t.String(),
        roleId: t.String()
      })
    }
  )

  // ── DELETE /companies/:id/users/:userId ─────────────────────
  .delete(
    "/:id/users/:userId",
    async ({ params, user, sessionId, request, set }) => {
      const uid = user!;
      const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, uid)).limit(1);
      const isSuperAdmin = dbUser?.isSuperAdmin === true;

      if (!isSuperAdmin) {
        const [role] = await db
          .select()
          .from(userCompanyRoles)
          .where(
            and(
              eq(userCompanyRoles.userId, uid),
              eq(userCompanyRoles.companyId, params.id),
              eq(userCompanyRoles.isActive, true),
              isNull(userCompanyRoles.revokedAt)
            )
          )
          .limit(1);
          
        if (!role) {
          set.status = 403; return { error: "Access denied" };
        }
      }

      await revokeUserFromCompany(params.id, params.userId);
        
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      await createAuditEntry({
        companyId: params.id, userId: uid, sessionId,
        action: "company_users:revoke", module: "companies",
        entityType: "user_company_roles", entityId: params.userId,
        beforeState: null, afterState: { revoked: true }, ipAddress: ip,
      });

      return { message: "User access revoked" };
    },
    {
      params: t.Object({
        id: t.String(),
        userId: t.String()
      })
    }
  );
