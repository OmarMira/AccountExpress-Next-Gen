// ============================================================
// AUDIT ROUTES — GET /audit (read-only + chain verification)
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { Elysia, t } from "elysia";
import { db, sql } from "../db/connection.ts";
import { auditLogs, users } from "../db/schema/index.ts";
import { eq, and, desc, gte, lte } from "drizzle-orm";

import { verifyAuditChain } from "../services/audit.service.ts";
import { authMiddleware, requireAuth } from "../middleware/auth.middleware.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";

export const auditRoutes = new Elysia({ prefix: "/audit" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })

  // GET /audit/integrity-report — forensic integrity report (JSON download)
  .get("/integrity-report", async ({ set, user }) => {
    const [dbUser] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, user!))
      .limit(1);

    if (!dbUser?.isSuperAdmin) {
      set.status = 403;
      return { success: false, error: "Super Admin privileges required" };
    }

    const chainResult = await verifyAuditChain();

    const [countRow] = await db.execute(sql`SELECT COUNT(*) AS total FROM audit_logs`) as { total: string }[];
    const [lastRow]  = await db.execute(sql`SELECT created_at FROM audit_logs ORDER BY chain_index DESC LIMIT 1`) as { created_at: string }[];

    const report = {
      generatedAt:    new Date().toISOString(),
      chainIntegrity: chainResult.valid,
      totalEntries:   parseInt(countRow?.total ?? "0", 10),
      lastEntryAt:    lastRow?.created_at ?? null,
      details:        chainResult,
    };

    set.headers["Content-Type"]        = "application/json";
    set.headers["Content-Disposition"] = `attachment; filename="integrity-report-${Date.now()}.json"`;
    return report;
  })

  // GET /audit/verify — cryptographic chain validation
  .get("/verify", async ({ set, user }) => {
    const [dbUser] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, user!))
      .limit(1);

    if (!dbUser?.isSuperAdmin) {
      set.status = 403;
      return { success: false, error: "Super Admin privileges required" };
    }

    return await verifyAuditChain();
  })

  .use(requirePermission("audit", "read"))

  // GET /audit?userId=&date=&startTime=&endTime=&module=&limit=&offset=
  .get("/", async ({ query, companyId, set }) => {
    if (!companyId) {
      set.status = 403;
      return { success: false, error: 'No active company in session.' };
    }

    const conditions = [];
    conditions.push(eq(auditLogs.companyId, companyId));
    if (query.userId)    conditions.push(eq(auditLogs.userId, query.userId));
    if (query.module)    conditions.push(eq(auditLogs.module, query.module));
    if (query.action)    conditions.push(eq(auditLogs.action, query.action));

    // Date and Time Filter
    if (query.date) {
      const dateStr = query.date; // YYYY-MM-DD
      const start = new Date(`${dateStr}T${query.startTime || "00:00"}:00`);
      const end = new Date(`${dateStr}T${query.endTime || "23:59:59.999"}:00`);
      
      if (!isNaN(start.getTime())) conditions.push(gte(auditLogs.createdAt, start));
      if (!isNaN(end.getTime())) conditions.push(lte(auditLogs.createdAt, end));
    }

    const limitVal  = query.limit  ? parseInt(query.limit)  : 100;
    const offsetVal = query.offset ? parseInt(query.offset) : 0;
    const safeLimit  = Number.isFinite(limitVal)  && limitVal > 0  ? limitVal : 100;
    const safeOffset = Number.isFinite(offsetVal) && offsetVal >= 0 ? offsetVal : 0;

    const results = await db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(safeLimit)
      .offset(safeOffset)
      .orderBy(desc(auditLogs.createdAt));

    return { success: true, data: results };
  }, {
    query: t.Object({
      userId:    t.Optional(t.String()),
      date:      t.Optional(t.String()),
      startTime: t.Optional(t.String()),
      endTime:   t.Optional(t.String()),
      module:    t.Optional(t.String()),
      action:    t.Optional(t.String()),
      limit:     t.Optional(t.String()),
      offset:    t.Optional(t.String()),
    }, { additionalProperties: false })
  })

  // GET /audit/:id — single entry
  .get("/:id", async ({ params, companyId, set }) => {
    if (!companyId) {
      set.status = 403;
      return { success: false, error: 'No active company in session.' };
    }

    const [entry] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, params.id))
      .limit(1);

    if (!entry) { set.status = 404; return { error: "Audit entry not found" }; }

    if (entry.companyId !== companyId) {
      set.status = 403;
      return { success: false, error: 'Acceso denegado' };
    }

    return entry;
  }, {
    params: t.Object({
      id: t.String()
    }, { additionalProperties: false })
  });
