// ============================================================
// REPORTS & EXPORT ROUTES
// Routes for financial reports and CPA tax export
// ============================================================

import { Elysia, t } from "elysia";
import { getBalanceSheet } from "../services/reports/balance-sheet.service.ts";
import { getIncomeStatement } from "../services/reports/income-statement.service.ts";
import { getTrialBalance } from "../services/reports/trial-balance.service.ts";
import { getCashFlow } from "../services/reports/cash-flow.service.ts";
import { generateCpaSummary } from "../services/reports/cpa-summary.service.ts";
import { validateSession } from "../services/session.service.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";

export const reportsRoutes = new Elysia()
  // ── Reports Group ──────────────────────────────────────────
  .group("/reports", (app) =>
    app
      .use(requirePermission("reports", "read"))

      .get("/balance-sheet", ({ query, cookie, set }) => {
        const token = cookie["session"].value as string;
        if (!validateSession(token)) { set.status = 401; return { error: "Not authenticated" }; }
        
        try {
          return { success: true, data: getBalanceSheet(query.companyId, query.asOfDate) };
        } catch (err: any) {
          set.status = 400;
          return { success: false, error: err.message };
        }
      }, {
        query: t.Object({
          companyId: t.String(),
          asOfDate: t.String(),
        })
      })

      .get("/income-statement", ({ query, cookie, set }) => {
        const token = cookie["session"].value as string;
        if (!validateSession(token)) { set.status = 401; return { error: "Not authenticated" }; }
        
        return { success: true, data: getIncomeStatement(query.companyId, query.startDate, query.endDate) };
      }, {
        query: t.Object({
          companyId: t.String(),
          startDate: t.String(),
          endDate: t.String(),
        })
      })

      .get("/trial-balance", ({ query, cookie, set }) => {
        const token = cookie["session"].value as string;
        if (!validateSession(token)) { set.status = 401; return { error: "Not authenticated" }; }
        
        try {
          return { success: true, data: getTrialBalance(query.companyId, query.asOfDate) };
        } catch (err: any) {
          set.status = 400;
          return { success: false, error: err.message };
        }
      }, {
        query: t.Object({
          companyId: t.String(),
          asOfDate: t.String(),
        })
      })

      .get("/cash-flow", ({ query, cookie, set }) => {
        const token = cookie["session"].value as string;
        if (!validateSession(token)) { set.status = 401; return { error: "Not authenticated" }; }
        
        return { success: true, data: getCashFlow(query.companyId, query.startDate, query.endDate) };
      }, {
        query: t.Object({
          companyId: t.String(),
          startDate: t.String(),
          endDate: t.String(),
        })
      })
  )

  // ── Export Group ───────────────────────────────────────────
  .group("/export", (app) =>
    app
      .use(requirePermission("reports", "export"))

      .post("/cpa-summary", ({ body, cookie, set }) => {
        const token = cookie["session"].value as string;
        if (!validateSession(token)) { set.status = 401; return { error: "Not authenticated" }; }
        
        try {
          return { success: true, data: generateCpaSummary(body.companyId, body.periodId) };
        } catch (err: any) {
          set.status = 400;
          return { success: false, error: err.message };
        }
      }, {
        body: t.Object({
          companyId: t.String(),
          periodId: t.String(),
        })
      })
  );

