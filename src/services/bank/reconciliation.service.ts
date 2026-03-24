// ============================================================
// RECONCILIATION SERVICE
// Translates abstract Bank Transactions into rigorous
// Double-Entry Journal Entries automatically.
// ============================================================

import { rawDb } from "../../db/connection.ts";
import { createDraft, post, ValidationError } from "../journal.service.ts";
import { v4 as uuidv4 } from "uuid";

// ── Perform Bank Reconciliation ─────────────────────────────
export function matchTransaction(
  companyId: string,
  transactionId: string,
  accountId: string,   // Target specific COA (e.g., Office Supplies)
  bankAccountId: string, // The actual Bank COA (e.g., 1010 Cash)
  periodId: string,
  userId: string,
  sessionId: string,
  ipAddress: string
): string {
  const transactionLock = rawDb.transaction(() => {
    // 1. Validate Transaction
    const tx = rawDb.query(
      `SELECT * FROM bank_transactions WHERE id = ? AND company_id = ?`
    ).get(transactionId, companyId) as any;

    if (!tx) throw new ValidationError("Transacción bancaria no encontrada.");
    if (tx.status === "reconciled") throw new ValidationError("La transacción ya se encuentra conciliada.");

    // 2. Draft double-entry lines
    const absAmount = Math.abs(tx.amount);
    
    // Default US GAAP perspective
    // Bank outflow (- amount) -> Credit Bank, Debit Expense
    // Bank inflow (+ amount) -> Debit Bank, Credit Revenue
    const bankLine = {
      accountId: bankAccountId,
      debitAmount:  tx.amount > 0 ? absAmount : 0,
      creditAmount: tx.amount < 0 ? absAmount : 0,
      lineNumber: 1,
      description: `Ref: ${tx.description}`
    };

    const targetLine = {
      accountId: accountId,
      debitAmount:  tx.amount < 0 ? absAmount : 0,
      creditAmount: tx.amount > 0 ? absAmount : 0,
      lineNumber: 2,
      description: `Reconciliación: ${tx.description}`
    };

    // 3. Dispatch Journal Drafting
    const draftId = createDraft({
      companyId,
      entryDate: tx.transaction_date,
      description: `Conciliación Bancaria: ${tx.description}`,
      reference: tx.reference_number,
      isAdjusting: false,
      periodId,
      createdBy: userId
    }, [bankLine, targetLine]);

    // 4. Force strict double-entry verification via Post() mechanically
    post(draftId, userId, sessionId, ipAddress);

    // 5. Hard link completion to the Bank state
    rawDb.prepare(`
      UPDATE bank_transactions
      SET status = 'reconciled', journal_entry_id = ?, matched_by = ?, matched_at = ?
      WHERE id = ?
    `).run(draftId, userId, new Date().toISOString(), transactionId);

    return draftId;
  });

  return transactionLock();
}

// ── Ignore Bank Transaction ─────────────────────────────────
export function ignoreTransaction(
  companyId: string,
  transactionId: string,
  userId: string,
  ipAddress: string
): void {
  const transactionLock = rawDb.transaction(() => {
    const tx = rawDb.query(
      `SELECT * FROM bank_transactions WHERE id = ? AND company_id = ?`
    ).get(transactionId, companyId) as any;

    if (!tx) throw new ValidationError("Transacción bancaria no encontrada.");
    if (tx.status !== "pending") throw new ValidationError("Sólo las transacciones pendientes pueden ser ignoradas.");

    rawDb.prepare(`
      UPDATE bank_transactions
      SET status = 'ignored', matched_by = ?, matched_at = ?
      WHERE id = ?
    `).run(userId, new Date().toISOString(), transactionId);
  });

  transactionLock();
}

