import { Elysia, t } from "elysia";
import { validateSession } from "../services/session.service.ts";
import { rawDb } from "../db/connection.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { verifyAuditChain } from "../services/audit.service.ts";

export const dashboardRoutes = new Elysia({ prefix: "/dashboard" })
  .use(requirePermission("reports", "read"))
  .get("/", ({ query, cookie, set }) => {
    const token = cookie["session"].value as string;
    if (!validateSession(token)) {
      set.status = 401;
      return { error: "Not authenticated" };
    }

    const companyId = query.companyId;

    try {
      // Get bank balance
      const bankResult = rawDb.query(`
        SELECT SUM(balance) as total FROM bank_accounts WHERE company_id = ?
      `).get(companyId) as any;

      // Get pending transactions
      const pendingResult = rawDb.query(`
        SELECT COUNT(*) as count FROM bank_transactions WHERE company_id = ? AND status = 'pending'
      `).get(companyId) as any;

      // Ensure chain integrity
      const chainValid = verifyAuditChain().valid;

      // Active Period
      const periodResult = rawDb.query(`
        SELECT name, end_date FROM fiscal_periods WHERE company_id = ? AND status = 'open' ORDER BY start_date ASC LIMIT 1
      `).get(companyId) as any;

      return {
        success: true,
        data: {
          bankBalance: bankResult?.total || 0,
          pendingCount: pendingResult?.count || 0,
          income: 0, // Placeholder
          expenses: 0, // Placeholder
          activePeriod: {
            name: periodResult?.name || "No open period",
            endDate: periodResult?.end_date || "N/A"
          },
          chainValid: chainValid
        }
      };
    } catch (err: any) {
      set.status = 400;
      return { error: err.message };
    }
  }, {
    query: t.Object({
      companyId: t.String()
    })
  });
