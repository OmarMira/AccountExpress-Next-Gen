// ============================================================
// REPORTS & EXPORT ROUTES
// Routes for financial reports and CPA tax export
// ============================================================

import { Elysia, t } from "elysia";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
import { getBalanceSheet } from "../services/reports/balance-sheet.service.ts";
import { getIncomeStatement } from "../services/reports/income-statement.service.ts";
import { getTrialBalance } from "../services/reports/trial-balance.service.ts";
import { getCashFlow } from "../services/reports/cash-flow.service.ts";
import { generateCpaSummary } from "../services/reports/cpa-summary.service.ts";
import { buildCpaPdf } from "../services/reports/pdf-builder.service.ts";
import { getAgingReport } from "../services/reports/aging.service.ts";

import { requirePermission } from "../middleware/rbac.middleware.ts";
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";

export const reportsRoutes = new Elysia()
  .use(authMiddleware)
  // ── Reports Group ──────────────────────────────────────────
  .group("/reports", (app) =>
    app
      .guard({ beforeHandle: requireAuth })
      .use(requirePermission("reports", "read"))

      .get("/balance-sheet", async ({ query, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { success: false, error: 'No active company in session.' };
        }
        return { success: true, data: await getBalanceSheet(companyId, query.asOfDate) };
      }, {
        query: t.Object({
          asOfDate: t.String(),
        }, { additionalProperties: false })
      })

      .get("/income-statement", async ({ query, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { success: false, error: 'No active company in session.' };
        }
        return { success: true, data: await getIncomeStatement(companyId, query.startDate, query.endDate) };
      }, {
        query: t.Object({
          startDate: t.String(),
          endDate: t.String(),
        }, { additionalProperties: false })
      })

      .get("/trial-balance", async ({ query, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { success: false, error: 'No active company in session.' };
        }
        return { success: true, data: await getTrialBalance(companyId, query.asOfDate) };
      }, {
        query: t.Object({
          asOfDate: t.String(),
        }, { additionalProperties: false })
      })

      .get("/cash-flow", async ({ query, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { success: false, error: 'No active company in session.' };
        }
        return { success: true, data: await getCashFlow(companyId, query.startDate, query.endDate) };
      }, {
        query: t.Object({
          startDate: t.String(),
          endDate: t.String(),
        }, { additionalProperties: false })
      })

      .get("/aging", async ({ query, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { success: false, error: 'No active company in session.' };
        }
        try {
          const asOfDate = query.asOfDate ?? new Date().toISOString().split("T")[0];
          return { success: true, data: await getAgingReport(companyId, asOfDate) };
        } catch (err: unknown) {
          set.status = 400;
          return { success: false, error: errMsg(err) };
        }
      }, {
        query: t.Object({
          asOfDate: t.Optional(t.String()),
        }, { additionalProperties: false })
      })
  )

  // ── Export Group ───────────────────────────────────────────
  .group("/export", (app) =>
    app
      .guard({ beforeHandle: requireAuth })
      .use(requirePermission("reports", "export"))

      .post("/cpa-summary", async ({ body, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { success: false, error: 'No active company in session.' };
        }
        return { success: true, data: await generateCpaSummary(companyId, body.periodId) };
      }, {
        body: t.Object({
          periodId: t.String(),
        }, { additionalProperties: false })
      })

      .get("/cpa-summary/download", async ({ query, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { success: false, error: 'No active company in session.' };
        }
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
          periodId: t.String(),
        }, { additionalProperties: false })
      })

      .get("/aging", async ({ query, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { success: false, error: 'No active company in session.' };
        }
        try {
          const asOfDate = query.asOfDate ?? new Date().toISOString().split("T")[0];
          return { success: true, data: await getAgingReport(companyId, asOfDate) };
        } catch (err: unknown) {
          set.status = 400;
          return { success: false, error: errMsg(err) };
        }
      }, {
        query: t.Object({
          asOfDate: t.Optional(t.String()),
        }, { additionalProperties: false })
      })
  );

