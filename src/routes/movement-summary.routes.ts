// ============================================================
// MOVEMENT SUMMARY ROUTES
// GET /api/movement-summary
// Returns aggregated totals for bank pending, bank assigned,
// and manual journal entries. Scoped by companyId from session.
// ============================================================

import { Elysia, t } from "elysia";
import { db, sql } from "../db/connection.ts";
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";

interface BankBalanceRow {
  totalBalance: string;
  accountCount: string;
}

interface SummaryRow {
  count: string;
  totalDebit: string;
  totalCredit: string;
}

function toNum(v: string | null | undefined): number {
  return parseFloat(v ?? "0") || 0;
}

function buildSummary(row: SummaryRow) {
  const count      = parseInt(row.count, 10) || 0;
  const totalDebit  = toNum(row.totalDebit);
  const totalCredit = toNum(row.totalCredit);
  return {
    count,
    totalDebit,
    totalCredit,
    difference: totalDebit - totalCredit,
  };
}

export const movementSummaryRoutes = new Elysia({ prefix: "/movement-summary" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })

  .get(
    "/",
    async ({ companyId, query, set }) => {
      if (!companyId) {
        set.status = 403;
        return { error: "No active company in session." };
      }

      const { startDate, endDate } = query;

      // ── 1. BANK PENDING (no GL account assigned, status = pending) ────
      const bankPendingRaw = await db.execute(sql`
        SELECT
          COUNT(*)::text                                AS "count",
          COALESCE(SUM(CASE WHEN transaction_type = 'debit'  THEN ABS(amount::numeric) ELSE 0 END), 0)::text AS "totalDebit",
          COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN ABS(amount::numeric) ELSE 0 END), 0)::text AS "totalCredit"
        FROM bank_transactions
        WHERE company_id = ${companyId}
          AND status     = 'pending'
          ${startDate ? sql`AND transaction_date >= ${startDate}` : sql``}
          ${endDate   ? sql`AND transaction_date <= ${endDate}`   : sql``}
      `) as unknown as SummaryRow[];

      // ── 2. BANK ASSIGNED (gl_account_id IS NOT NULL) ──────────────────
      const bankAssignedRaw = await db.execute(sql`
        SELECT
          COUNT(*)::text                                AS "count",
          COALESCE(SUM(CASE WHEN transaction_type = 'debit'  THEN ABS(amount::numeric) ELSE 0 END), 0)::text AS "totalDebit",
          COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN ABS(amount::numeric) ELSE 0 END), 0)::text AS "totalCredit"
        FROM bank_transactions
        WHERE company_id    = ${companyId}
          AND gl_account_id IS NOT NULL
          ${startDate ? sql`AND transaction_date >= ${startDate}` : sql``}
          ${endDate   ? sql`AND transaction_date <= ${endDate}`   : sql``}
      `) as unknown as SummaryRow[];

      // ── 3. MANUAL JOURNAL ENTRIES (sum via journal_lines) ─────────────
      const manualEntriesRaw = await db.execute(sql`
        SELECT
          COUNT(DISTINCT je.id)::text                  AS "count",
          COALESCE(SUM(jl.debit_amount::numeric),  0)::text AS "totalDebit",
          COALESCE(SUM(jl.credit_amount::numeric), 0)::text AS "totalCredit"
        FROM journal_entries je
        JOIN journal_lines   jl ON jl.journal_entry_id = je.id
        WHERE je.company_id = ${companyId}
          AND je.status    != 'voided'
          ${startDate ? sql`AND je.entry_date >= ${startDate}` : sql``}
          ${endDate   ? sql`AND je.entry_date <= ${endDate}`   : sql``}
      `) as unknown as SummaryRow[];

      const bankPending   = buildSummary(bankPendingRaw[0]  ?? { count: "0", totalDebit: "0", totalCredit: "0" });
      const bankAssigned  = buildSummary(bankAssignedRaw[0] ?? { count: "0", totalDebit: "0", totalCredit: "0" });
      const manualEntries = buildSummary(manualEntriesRaw[0] ?? { count: "0", totalDebit: "0", totalCredit: "0" });

      // ── 4. BANK ACCOUNTS INITIAL BALANCE ─────────────────────────────
      // initial_balance is stored in integer cents → divide by 100 to get dollars
      // Only the EARLIEST imported statement's beginning balance is stored here.
      const bankBalanceRaw = await db.execute(sql`
        SELECT
          COALESCE(SUM(initial_balance), 0)::text         AS "totalBalance",
          COUNT(*)::text                                  AS "accountCount",
          MIN(initial_balance_period_start)               AS "earliestPeriodStart"
        FROM bank_accounts
        WHERE company_id = ${companyId}
          AND is_active  = true
      `) as unknown as BankBalanceRow[];

      const bankBalanceRow = bankBalanceRaw[0] ?? { totalBalance: "0", accountCount: "0" };
      const bankAccountsBalance = {
        total:              toNum(bankBalanceRow.totalBalance) / 100,
        accountCount:       parseInt(bankBalanceRow.accountCount, 10) || 0,
        earliestPeriodStart: (bankBalanceRow as any).earliestPeriodStart ?? null,
      };

      const grandTotal = {
        totalDebit:  bankPending.totalDebit  + bankAssigned.totalDebit  + manualEntries.totalDebit,
        totalCredit: bankPending.totalCredit + bankAssigned.totalCredit + manualEntries.totalCredit,
        difference:  (bankPending.totalDebit + bankAssigned.totalDebit + manualEntries.totalDebit)
                   - (bankPending.totalCredit + bankAssigned.totalCredit + manualEntries.totalCredit),
      };

      return {
        success: true,
        data: { bankPending, bankAssigned, manualEntries, grandTotal, bankAccountsBalance },
      };
    },
    {
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate:   t.Optional(t.String()),
      }),
    }
  );
