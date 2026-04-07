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
import { buildCpaPdf } from "../services/reports/pdf-builder.service.ts";
import { getAgingReport } from "../services/reports/aging.service.ts";

import { requirePermission } from "../middleware/rbac.middleware.ts";
import { requireAuth } from "../middleware/auth.middleware.ts";

export const reportsRoutes = new Elysia()
  // ── Reports Group ──────────────────────────────────────────
  .group("/reports", (app) =>
    app
      .guard({ beforeHandle: requireAuth })
      .use(requirePermission("reports", "read"))

      .get("/balance-sheet", async ({ query }) => {
        return { success: true, data: await getBalanceSheet(query.companyId, query.asOfDate) };
      }, {
        query: t.Object({
          companyId: t.String(),
          asOfDate: t.String(),
        })
      })

      .get("/income-statement", async ({ query }) => {
        return { success: true, data: await getIncomeStatement(query.companyId, query.startDate, query.endDate) };
      }, {
        query: t.Object({
          companyId: t.String(),
          startDate: t.String(),
          endDate: t.String(),
        })
      })

      .get("/trial-balance", async ({ query }) => {
        return { success: true, data: await getTrialBalance(query.companyId, query.asOfDate) };
      }, {
        query: t.Object({
          companyId: t.String(),
          asOfDate: t.String(),
        })
      })

      .get("/cash-flow", async ({ query }) => {
        return { success: true, data: await getCashFlow(query.companyId, query.startDate, query.endDate) };
      }, {
        query: t.Object({
          companyId: t.String(),
          startDate: t.String(),
          endDate: t.String(),
        })
      })

      .get("/aging", async ({ query, set }) => {
        try {
          const asOfDate = query.asOfDate ?? new Date().toISOString().split("T")[0];
          return { success: true, data: await getAgingReport(query.companyId, asOfDate) };
        } catch (err: any) {
          set.status = 400;
          return { success: false, error: err.message };
        }
      }, {
        query: t.Object({
          companyId: t.String(),
          asOfDate: t.Optional(t.String()),
        })
      })
  )

  // ── Export Group ───────────────────────────────────────────
  .group("/export", (app) =>
    app
      .guard({ beforeHandle: requireAuth })
      .use(requirePermission("reports", "export"))

      .post("/cpa-summary", async ({ body }) => {
        return { success: true, data: await generateCpaSummary(body.companyId, body.periodId) };
      }, {
        body: t.Object({
          companyId: t.String(),
          periodId: t.String(),
        })
      })

      .get("/cpa-summary/download", async ({ query }) => {
        const companyId = query.companyId;
        const periodId  = query.periodId;

        const summary = await generateCpaSummary(companyId, periodId);
        const pdfBytes = await buildCpaPdf(summary);

        return new Response(pdfBytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="tax-summary-${periodId}.pdf"`
          }
        });
      }, {
        query: t.Object({
          companyId: t.String(),
          periodId: t.String(),
        })
      })

      .get("/aging", async ({ query, set }) => {
        try {
          const asOfDate = query.asOfDate ?? new Date().toISOString().split("T")[0];
          return { success: true, data: await getAgingReport(query.companyId, asOfDate) };
        } catch (err: any) {
          set.status = 400;
          return { success: false, error: err.message };
        }
      }, {
        query: t.Object({
          companyId: t.String(),
          asOfDate: t.Optional(t.String()),
        })
      })
  );

