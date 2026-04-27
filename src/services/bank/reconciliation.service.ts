// ============================================================
// RECONCILIATION SERVICE
// Translates abstract Bank Transactions into rigorous
// Double-Entry Journal Entries automatically.
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { db } from "../../db/connection.ts";
import { bankTransactions } from "../../db/schema/index.ts";
import { eq, and } from "drizzle-orm";
import { createDraft, post } from "../journal-core.service.ts";
import { ValidationError } from "../../lib/errors.ts";
import { v4 as uuidv4 } from "uuid";

// ── Perform Bank Reconciliation ─────────────────────────────
export async function matchTransaction(
  companyId: string,
  transactionId: string,
  accountId: string,   // Target specific COA (e.g., Office Supplies)
  bankAccountId: string, // The actual Bank COA (e.g., 1010 Cash)
  periodId: string,
  userId: string,
  sessionId: string,
  ipAddress: string
): Promise<string> {
  return await db.transaction(async (tx) => {
    // 1. Validate Transaction
    const [transaction] = await tx
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.id, transactionId),
          eq(bankTransactions.companyId, companyId)
        )
      )
      .limit(1);

    if (!transaction) throw new ValidationError("Transacción bancaria no encontrada.");
    if (transaction.status === "reconciled") throw new ValidationError("La transacción ya se encuentra conciliada.");

    // 2. Draft double-entry lines
    const txAmountNum = Number(transaction.amount);
    const absAmount = Math.abs(txAmountNum);
    
    // Default US GAAP perspective
    // Bank outflow (- amount) -> Credit Bank, Debit Expense
    // Bank inflow (+ amount) -> Debit Bank, Credit Revenue
    const bankLine = {
      accountId: bankAccountId,
      debitAmount:  txAmountNum > 0 ? absAmount : 0,
      creditAmount: txAmountNum < 0 ? absAmount : 0,
      lineNumber: 1,
      description: `Ref: ${transaction.description}`
    };

    const targetLine = {
      accountId: accountId,
      debitAmount:  txAmountNum < 0 ? absAmount : 0,
      creditAmount: txAmountNum > 0 ? absAmount : 0,
      lineNumber: 2,
      description: `Reconciliación: ${transaction.description}`
    };

    // 3. Dispatch Journal Drafting
    const draftId = await createDraft({
      companyId,
      entryDate: transaction.transactionDate,
      description: `Conciliación Bancaria: ${transaction.description}`,
      reference: transaction.referenceNumber || null,
      isAdjusting: false,
      periodId,
      createdBy: userId
    }, [bankLine, targetLine], tx); // pass tx here to keep transaction bound

    // 4. Force strict double-entry verification via Post() mechanically
    await post(draftId, userId, sessionId, ipAddress, tx); // pass tx here as well

    // 5. Hard link completion to the Bank state
    await tx.update(bankTransactions)
      .set({
        status: 'reconciled',
        glAccountId: accountId,
        journalEntryId: draftId,
        matchedBy: userId,
        matchedAt: new Date()
      })
      .where(eq(bankTransactions.id, transactionId));

    return draftId;
  });
}

// ── Ignore Bank Transaction ─────────────────────────────────
export async function ignoreTransaction(
  companyId: string,
  transactionId: string,
  userId: string,
  ipAddress: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [transaction] = await tx
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.id, transactionId),
          eq(bankTransactions.companyId, companyId)
        )
      )
      .limit(1);

    if (!transaction) throw new ValidationError("Transacción bancaria no encontrada.");
    if (transaction.status !== "pending") throw new ValidationError("Sólo las transacciones pendientes pueden ser ignoradas.");

    await tx.update(bankTransactions)
      .set({
        status: 'ignored',
        matchedBy: userId,
        matchedAt: new Date()
      })
      .where(eq(bankTransactions.id, transactionId));
  });
}
