// ============================================================
// RECONCILIATION REPORT SERVICE
// Generates the official Bank Reconciliation statement.
// Compares General Ledger (Books) vs Bank Statement (Reality).
// ============================================================

import { db } from "../../db/connection.ts";
import { 
  bankTransactions, 
  bankAccounts, 
  journalLines, 
  journalEntries,
  fiscalPeriods
} from "../../db/schema/index.ts";
import { eq, and, sql, lte, ne } from "drizzle-orm";
import { ValidationError } from "../../lib/errors.ts";

export interface ReconciliationReport {
  bankAccount: any;
  period: any;
  balancePerBooks: number;
  balancePerStatement: number;
  difference: number;
  reconciledItems: any[];
  unreconciledItems: any[];
}

export async function getReconciliationReport(
  companyId: string,
  bankAccountId: string,
  periodId: string
): Promise<ReconciliationReport> {
  // 1. Fetch Core Metadata
  const [bankAccount] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId)))
    .limit(1);

  if (!bankAccount) throw new ValidationError("Cuenta bancaria no encontrada.");

  const [period] = await db
    .select()
    .from(fiscalPeriods)
    .where(and(eq(fiscalPeriods.id, periodId), eq(fiscalPeriods.companyId, companyId)))
    .limit(1);

  if (!period) throw new ValidationError("Periodo fiscal no encontrado.");

  // 2. Calculate Balance Per Books (GL)
  // We sum all journal lines for the GL account assigned to this bank account
  // up to the end date of the period.
  const glAccountId = bankAccount.glAccountId;
  if (!glAccountId) throw new ValidationError("La cuenta bancaria no tiene una cuenta contable asignada.");

  const [booksResult] = await db
    .select({
      total: sql<string>`SUM(CAST(${journalLines.debitAmount} AS NUMERIC) - CAST(${journalLines.creditAmount} AS NUMERIC))`
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(
      and(
        eq(journalLines.companyId, companyId),
        eq(journalLines.accountId, glAccountId),
        eq(journalEntries.status, "posted"),
        lte(journalEntries.entryDate, period.endDate)
      )
    );

  const balancePerBooks = parseFloat(booksResult?.total || "0");

  // 3. Balance Per Statement (Reality)
  // This is the current balance in the bank account record (stored in cents)
  const balancePerStatement = (bankAccount.balance || 0) / 100;

  // 4. Fetch Items for the Period
  // bank_transactions.bank_account may store either the bank_accounts.id (UUID)
  // or the bank_accounts.account_number depending on import source.
  // We accept both to ensure full coverage.
  const txs = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        sql`(${
          bankTransactions.bankAccount
        } = ${bankAccount.id} OR ${
          bankTransactions.bankAccount
        } = ${bankAccount.accountNumber || ''})`,
        lte(bankTransactions.transactionDate, period.endDate),
        sql`${bankTransactions.transactionDate} >= ${period.startDate}`
      )
    );

  const reconciledItems   = txs.filter(t => t.status === "reconciled");
  const unreconciledItems = txs.filter(t => t.status !== "reconciled" && t.status !== "ignored");

  // difference: positive means books > statement (outstanding deposits)
  //             negative means statement > books (outstanding checks)
  //             zero means fully reconciled
  const difference = Math.round((balancePerBooks - balancePerStatement) * 100) / 100;

  return {
    bankAccount,
    period,
    balancePerBooks,
    balancePerStatement,
    difference,
    reconciledItems,
    unreconciledItems
  };
}

export async function getOpenItemsReport(companyId: string) {
  // 1. Fetch all active bank accounts
  const accounts = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.isActive, true)));

  // 2. Fetch all unreconciled transactions for these accounts
  // Statuses to include: pending, matched, assigned
  const openItems = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        ne(bankTransactions.status, "reconciled"),
        ne(bankTransactions.status, "ignored")
      )
    );

  // 3. Group by bank account — match by id OR accountNumber
  const grouped = accounts.map(acc => {
    const items = openItems.filter(item =>
      item.bankAccount === acc.id ||
      item.bankAccount === acc.accountNumber
    );
    const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.amount), 0);

    return {
      accountId:           acc.id,
      accountName:         acc.accountName,
      accountNumber:       acc.accountNumber,
      bankName:            acc.bankName,
      pendingCount:        items.length,
      totalPendingAmount:  Math.round(totalAmount * 100) / 100,
      items
    };
  });

  return grouped;
}
