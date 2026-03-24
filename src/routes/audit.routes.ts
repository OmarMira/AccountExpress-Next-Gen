// ============================================================
// AUDIT ROUTES — GET /audit (read-only + chain verification)
// ============================================================

import { Elysia } from "elysia";
import { rawDb } from "../db/connection.ts";
import { validateSession } from "../services/session.service.ts";
import { verifyAuditChain } from "../services/audit.service.ts";

export const auditRoutes = new Elysia({ prefix: "/audit" })

  // GET /audit?companyId=&module=&limit=&offset=
  .get("/", ({ query, cookie, set }) => {
    const token = (cookie["session"].value as string);
    if (!token || !validateSession(token)) { set.status = 401; return { error: "Not authenticated" }; }

    let sql = "SELECT * FROM audit_logs WHERE 1=1";
    const params: (string | number)[] = [];

    if ((query.companyId as string)) { sql += " AND company_id = ?"; params.push((query.companyId as string)); }
    if ((query.module as string))    { sql += " AND module = ?";     params.push((query.module as string)); }
    if ((query.action as string))    { sql += " AND action = ?";     params.push((query.action as string)); }

    sql += ` ORDER BY chain_index DESC LIMIT ${(query.limit as string) ? parseInt((query.limit as string)) : 100} OFFSET ${(query.offset as string) ? parseInt((query.offset as string)) : 0}`;

    return rawDb.query(sql).all(...params);
  })

  // GET /audit/verify — cryptographic chain validation
  .get("/verify", ({ cookie, set }) => {
    const token = (cookie["session"].value as string);
    if (!token || !validateSession(token)) { set.status = 401; return { error: "Not authenticated" }; }
    return verifyAuditChain();
  })

  // GET /audit/:id — single entry
  .get("/:id", ({ params, cookie, set }) => {
    const token = (cookie["session"].value as string);
    if (!token || !validateSession(token)) { set.status = 401; return { error: "Not authenticated" }; }
    const entry = rawDb.query("SELECT * FROM audit_logs WHERE id = ?").get((params.id as string));
    if (!entry) { set.status = 404; return { error: "Audit entry not found" }; }
    return entry;
  });

