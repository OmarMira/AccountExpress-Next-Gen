// ============================================================
// AUDIT ROUTES — GET /audit (read-only + chain verification)
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { Elysia, t } from "elysia";
import { db, sql } from "../db/connection.ts";
import { auditLogs } from "../db/schema/index.ts";
import { eq, and, desc, gte, lte } from "drizzle-orm";

import { verifyAuditChain } from "../services/audit.service.ts";
import { requireAuth } from "../middleware/auth.middleware.ts";

export const auditRoutes = new Elysia({ prefix: "/audit" })
  .guard({ beforeHandle: requireAuth })

  // GET /audit?companyId=&userId=&date=&startTime=&endTime=&module=&limit=&offset=
  .get("/", async ({ query }) => {
    const conditions = [];
    if (query.companyId) conditions.push(eq(auditLogs.companyId, query.companyId));
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
      companyId: t.Optional(t.String()),
      userId:    t.Optional(t.String()),
      date:      t.Optional(t.String()),
      startTime: t.Optional(t.String()),
      endTime:   t.Optional(t.String()),
      module:    t.Optional(t.String()),
      action:    t.Optional(t.String()),
      limit:     t.Optional(t.String()),
      offset:    t.Optional(t.String()),
    })
  })

  // GET /audit/verify — cryptographic chain validation
  .get("/verify", async () => {
    return await verifyAuditChain();
  })

  // GET /audit/:id — single entry
  .get("/:id", async ({ params, set }) => {
    const [entry] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, params.id))
      .limit(1);

    if (!entry) { set.status = 404; return { error: "Audit entry not found" }; }
    return entry;
  }, {
    params: t.Object({
      id: t.String()
    })
  });
