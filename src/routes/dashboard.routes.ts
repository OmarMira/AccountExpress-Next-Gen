// ============================================================
// DASHBOARD ROUTES — PostgreSQL 16 / Drizzle ORM
// ============================================================

import { Elysia, t } from "elysia";

import { db, sql } from "../db/connection.ts";
import { bankAccounts, bankTransactions, fiscalPeriods, journalLines, journalEntries, chartOfAccounts } from "../db/schema/index.ts";
import { eq, and, lte } from "drizzle-orm";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { verifyAuditChain } from "../services/audit.service.ts";
import { getBalanceSheet } from "../services/reports/balance-sheet.service.ts";
import { requireAuth } from "../middleware/auth.middleware.ts";

export const dashboardRoutes = new Elysia({ prefix: "/dashboard" })
  .guard({ beforeHandle: requireAuth })
  .use(requirePermission("reports", "read"))
  .get("/", async ({ query, set }) => {
    const companyId = query.companyId;

    // Get bank balance
    const [bankResult] = await db
      .select({ total: sql`SUM(${bankAccounts.balance})`.mapWith(Number) })
      .from(bankAccounts)
      .where(eq(bankAccounts.companyId, companyId))
      .limit(1);

    // Get pending transactions
    const [pendingResult] = await db
      .select({ count: sql`COUNT(*)`.mapWith(Number) })
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.companyId, companyId),
          eq(bankTransactions.status, "pending")
        )
      )
      .limit(1);

    // Ensure chain integrity
    const chainValidObj = await verifyAuditChain();
    const chainValid = chainValidObj.valid;

    // Active Period
    const [periodResult] = await db
      .select({ name: fiscalPeriods.name, endDate: fiscalPeriods.endDate })
      .from(fiscalPeriods)
      .where(
        and(
          eq(fiscalPeriods.companyId, companyId),
          eq(fiscalPeriods.status, "open")
        )
      )
      .orderBy(sql`${fiscalPeriods.startDate} ASC`)
      .limit(1);

    const today = new Date().toISOString().split('T')[0];
    const bs = await getBalanceSheet(companyId, today);

    // Raw query for revenue/expense summary using Drizzle tagged template
    const [revExp] = await db
      .select({
        revenue: sql`SUM(CASE WHEN ${chartOfAccounts.accountType} = 'revenue' THEN (${journalLines.creditAmount} - ${journalLines.debitAmount}) ELSE 0 END)`.mapWith(Number),
        expenses: sql`SUM(CASE WHEN ${chartOfAccounts.accountType} = 'expense' THEN (${journalLines.debitAmount} - ${journalLines.creditAmount}) ELSE 0 END)`.mapWith(Number)
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
      .where(
        and(
          eq(journalEntries.companyId, companyId),
          eq(journalEntries.status, "posted"),
          lte(journalEntries.entryDate, sql`${today}::date`)
        )
      )
      .limit(1);

    const inc = revExp?.revenue || 0;
    const exp = revExp?.expenses || 0;

    return {
      success: true,
      data: {
        bankBalance: bankResult?.total || 0,
        pendingCount: pendingResult?.count || 0,
        totalAssets: bs.assets.total,
        totalLiabilities: bs.liabilities.total,
        netIncome: inc - exp,
        income: inc,
        expenses: exp,
        activePeriod: {
          name: periodResult?.name || "No open period",
          endDate: periodResult?.endDate || "N/A"
        },
        chainValid: chainValid
      }
    };
  }, {
    query: t.Object({
      companyId: t.String()
    })
  });
