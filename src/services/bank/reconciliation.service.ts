// ============================================================
// RECONCILIATION SERVICE
// Translates abstract Bank Transactions into rigorous
// Double-Entry Journal Entries automatically.
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { db } from "../../db/connection.ts";
import { 
  bankTransactions, 
  bankAccounts, 
  journalLines, 
  journalEntries 
} from "../../db/schema/index.ts";
import { eq, and, sql, inArray } from "drizzle-orm";
import { createDraft, post } from "../journal-core.service.ts";
import { voidEntry } from "../journal-void.service.ts";
import { createAuditEntry } from "../audit.service.ts";
import { ValidationError } from "../../lib/errors.ts";
import { v4 as uuidv4 } from "uuid";

// ── Perform Bank Reconciliation ─────────────────────────────
export async function matchTransaction(
  companyId: string,
  transactionId: string,
  accountId: string | null,   // Target specific COA (e.g., Office Supplies)
  bankAccountId: string, // The actual Bank COA (e.g., 1010 Cash)
  periodId: string,
  userId: string,
  sessionId: string,
  ipAddress: string,
  appliedRuleId?: string,
  source: 'auto_matched' | 'manual' | 'new_entry' = 'new_entry',
  splits?: { glAccountId: string; amount: number }[]
): Promise<string> {
  return await db.transaction(async (tx: any) => {
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
    
    const lines: any[] = [];
    
    // 2.1 Bank Side Line
    lines.push({
      accountId: bankAccountId,
      debitAmount:  txAmountNum > 0 ? absAmount : 0,
      creditAmount: txAmountNum < 0 ? absAmount : 0,
      lineNumber: 1,
      description: `Ref: ${transaction.description}`
    });

    // 2.2 Counterpart Side (Single Account or Splits)
    const effectiveSplits = splits && splits.length > 0 ? splits : (transaction.reconciliationSplits as any[]);
    const effectiveAccountId = accountId || transaction.glAccountId;

    if (effectiveSplits && effectiveSplits.length > 0) {
      // Validate total splits matches transaction amount
      const totalSplits = effectiveSplits.reduce((acc, s) => acc + (typeof s.amount === 'string' ? parseFloat(s.amount) : s.amount), 0);
      if (Math.abs(totalSplits - absAmount) > 0.01) {
        throw new ValidationError(`El total de los splits (${totalSplits.toFixed(2)}) no coincide con el monto de la transacción (${absAmount.toFixed(2)}).`);
      }

      effectiveSplits.forEach((split, index) => {
        lines.push({
          accountId: split.glAccountId,
          debitAmount:  txAmountNum < 0 ? (typeof split.amount === 'string' ? parseFloat(split.amount) : split.amount) : 0,
          creditAmount: txAmountNum > 0 ? (typeof split.amount === 'string' ? parseFloat(split.amount) : split.amount) : 0,
          lineNumber: index + 2,
          description: `Reconciliación (Split ${index + 1}): ${transaction.description}`
        });
      });
    } else {
      if (!effectiveAccountId) throw new ValidationError("Debe proporcionar una cuenta contable o una distribución de montos (splits).");
      lines.push({
        accountId: effectiveAccountId,
        debitAmount:  txAmountNum < 0 ? absAmount : 0,
        creditAmount: txAmountNum > 0 ? absAmount : 0,
        lineNumber: 2,
        description: `Reconciliación: ${transaction.description}`
      });
    }

    // 2.3 Strict Balance Verification
    const totalDebits = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredits = lines.reduce((sum, l) => sum + l.creditAmount, 0);
    
    // Round to 2 decimal places to avoid float precision issues during validation
    if (Math.abs(Math.round(totalDebits * 100) - Math.round(totalCredits * 100)) > 0) {
      throw new ValidationError(`El asiento generado no está balanceado. Débitos: ${totalDebits.toFixed(2)}, Créditos: ${totalCredits.toFixed(2)}`);
    }

    // 3. Dispatch Journal Drafting
    const draftId = await createDraft({
      companyId,
      entryDate: transaction.transactionDate,
      description: `Conciliación Bancaria: ${transaction.description}`,
      reference: transaction.referenceNumber || null,
      isAdjusting: false,
      periodId,
      createdBy: userId
    }, lines, tx); // pass all lines (including splits)

    // 4. Force strict double-entry verification via Post() mechanically
    await post(draftId, userId, sessionId, ipAddress, tx); // pass tx here as well

    // 5. Hard link completion to the Bank state
    await tx.update(bankTransactions)
      .set({
        status: 'reconciled',
        glAccountId: accountId || (splits && splits.length > 0 ? splits[0].glAccountId : null), // Primary account for simple lookups
        journalEntryId: draftId,
        matchedBy: userId,
        matchedAt: new Date(),
        matchSource: source,
        reconciliationSplits: splits || null,
        ...(appliedRuleId ? { appliedRuleId } : {})
      })
      .where(eq(bankTransactions.id, transactionId));

    // 6. Recalculate Bank Account Balance
    // Find the bank account record by its account number (from transaction)
    const [accountRecord] = await tx
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.companyId, companyId),
          eq(bankAccounts.accountNumber, transaction.bankAccount)
        )
      )
      .limit(1);

    if (accountRecord) {
      await recalculateBankAccountBalance(companyId, accountRecord.id, tx);
    }

    return draftId;
  });
}

// ── Match against Existing Journal Lines ──────────────────
export async function matchAgainstJournal(input: {
  companyId: string;
  transactionId: string;
  lineIds: string[];
  userId: string;
  sessionId: string;
  ipAddress: string;
}): Promise<void> {
  return await db.transaction(async (tx: any) => {
    // 1. Fetch Bank Transaction
    const [transaction] = await tx
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.id, input.transactionId),
          eq(bankTransactions.companyId, input.companyId)
        )
      )
      .limit(1);

    if (!transaction) throw new ValidationError("Transacción bancaria no encontrada.");
    if (transaction.status === "reconciled") throw new ValidationError("La transacción ya se encuentra conciliada.");

    // 2. Fetch Journal Lines
    const lines = await tx
      .select({
        id: journalLines.id,
        debitAmount: journalLines.debitAmount,
        creditAmount: journalLines.creditAmount,
        journalEntryId: journalLines.journalEntryId,
        isReconciled: journalLines.isReconciled,
        companyId: journalLines.companyId
      })
      .from(journalLines)
      .where(inArray(journalLines.id, input.lineIds));

    if (lines.length !== input.lineIds.length) {
      throw new ValidationError("Una o más líneas de diario no existen.");
    }

    if (lines.some((l: any) => l.companyId !== input.companyId)) {
      throw new ValidationError("Una o más líneas no pertenecen a la compañía.");
    }

    if (lines.some((l: any) => l.isReconciled)) {
      throw new ValidationError("Una o más líneas ya han sido conciliadas previamente.");
    }

    // 3. Validate Amount Matching
    let totalJournalNet = 0;
    for (const line of lines) {
      totalJournalNet += (Number(line.debitAmount) - Number(line.creditAmount));
    }

    const txAmount = Number(transaction.amount);
    
    if (Math.abs(totalJournalNet - txAmount) > 0.001) {
      throw new ValidationError(`El monto no coincide. Banco: ${txAmount.toFixed(2)}, Diario: ${totalJournalNet.toFixed(2)}`);
    }

    const now = new Date();

    // 4. Update Journal Lines
    await tx.update(journalLines)
      .set({
        isReconciled: true,
        clearedAt: now
      })
      .where(inArray(journalLines.id, input.lineIds));

    // 5. Update Bank Transaction
    await tx.update(bankTransactions)
      .set({
        status: 'reconciled',
        journalEntryId: lines[0].journalEntryId,
        matchedBy: input.userId,
        matchedAt: now,
        reconciledAt: now,
        matchSource: 'manual'
      })
      .where(eq(bankTransactions.id, transaction.id));

    // 6. Recalculate Bank Balance
    const [accountRecord] = await tx
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.companyId, input.companyId),
          eq(bankAccounts.accountNumber, transaction.bankAccount)
        )
      )
      .limit(1);

    if (accountRecord) {
      await recalculateBankAccountBalance(input.companyId, accountRecord.id, tx);
    }
  });
}

// ── Unreconcile Bank Transaction ───────────────────────────
export async function unreconcileTransaction(input: {
  companyId: string;
  transactionId: string;
  userId: string;
  sessionId: string;
  ipAddress: string;
}): Promise<void> {
  return await db.transaction(async (tx: any) => {
    // 1. Fetch Bank Transaction
    const [transaction] = await tx
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.id, input.transactionId),
          eq(bankTransactions.companyId, input.companyId)
        )
      )
      .limit(1);

    if (!transaction) throw new ValidationError("Transacción bancaria no encontrada.");
    if (transaction.status !== "reconciled") throw new ValidationError("La transacción no se encuentra conciliada.");

    const entryId = transaction.journalEntryId;
    const source = transaction.matchSource;

    // 2. Handle Reversal / Unlinking
    if (entryId) {
      if (source === 'new_entry' || source === 'auto_matched') {
        // Void the generated entry
        await voidEntry(entryId, input.userId, input.sessionId, input.ipAddress, tx);
        
        // Clear isReconciled on the original lines
        await tx.update(journalLines)
          .set({ isReconciled: false, clearedAt: null })
          .where(
            and(
              eq(journalLines.journalEntryId, entryId),
              eq(journalLines.companyId, input.companyId)
            )
          );
      } else if (source === 'manual') {
        // Only unlink lines: find lines of this entry that are reconciled
        await tx.update(journalLines)
          .set({ isReconciled: false, clearedAt: null })
          .where(
            and(
              eq(journalLines.journalEntryId, entryId),
              eq(journalLines.isReconciled, true),
              eq(journalLines.companyId, input.companyId)
            )
          );
      }
    }

    // 3. Update Bank Transaction
    await tx.update(bankTransactions)
      .set({
        status: 'pending',
        journalEntryId: null,
        glAccountId: null,
        reconciledAt: null,
        matchSource: null,
        matchedBy: null,
        matchedAt: null
      })
      .where(eq(bankTransactions.id, transaction.id));

    // 4. Recalculate Balance
    const [accountRecord] = await tx
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.companyId, input.companyId),
          eq(bankAccounts.accountNumber, transaction.bankAccount)
        )
      )
      .limit(1);

    if (accountRecord) {
      await recalculateBankAccountBalance(input.companyId, accountRecord.id, tx);
    }

    // 5. Audit Log
    await createAuditEntry({
      companyId: input.companyId,
      userId: input.userId,
      sessionId: input.sessionId,
      action: "bank:unreconcile",
      module: "bank",
      entityType: "bank_transaction",
      entityId: transaction.id,
      beforeState: { status: 'reconciled', journalEntryId: entryId, source },
      afterState: { status: 'pending' },
      ipAddress: input.ipAddress
    }, tx);
  });
}

// ── Ignore Bank Transaction ─────────────────────────────────
export async function ignoreTransaction(
  companyId: string,
  transactionId: string,
  userId: string,
  ipAddress: string
): Promise<void> {
  await db.transaction(async (tx: any) => {
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

// ── Recalculate Bank Account Balance ─────────────────────────
// STRATEGY: Option A — Service-based recalculation.
// This is triggered manually after imports or reconciliation events.
// Formula: initial_balance + SUM(reconciled bank_transactions)
export async function recalculateBankAccountBalance(
  companyId: string,
  bankAccountId: string,
  tx?: any
): Promise<number> {
  const runner = tx || db;

  // 1. Get initial balance and account number
  const [account] = await runner
    .select({
      id: bankAccounts.id,
      initialBalance: bankAccounts.initialBalance,
      accountNumber: bankAccounts.accountNumber
    })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, bankAccountId),
        eq(bankAccounts.companyId, companyId)
      )
    )
    .limit(1);

  if (!account) throw new ValidationError("Cuenta bancaria no encontrada.");

  // 2. Sum reconciled transactions for this specific account
  const result = await runner
    .select({
      sum: sql<string>`sum(${bankTransactions.amount})`
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccount, account.accountNumber || ''),
        eq(bankTransactions.status, 'reconciled')
      )
    );

  // Convert sum string to number and then to cents
  const sumCents = Math.round(Number(result[0]?.sum || 0) * 100);
  const newBalance = account.initialBalance + sumCents;

  // 3. Update account balance (stored as cents)
  await runner.update(bankAccounts)
    .set({
      balance: newBalance,
      updatedAt: new Date()
    })
    .where(eq(bankAccounts.id, bankAccountId));

  return newBalance;
}

export async function getBankAccountBalanceSummary(
  companyId: string,
  bankAccountId: string
): Promise<{
  initialBalance: number;
  reconciledSum: number;
  currentBalance: number;
  pendingCount: number;
}> {
  // 1. Get initial balance
  const [account] = await db
    .select({
      initialBalance: bankAccounts.initialBalance,
      accountNumber: bankAccounts.accountNumber
    })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, bankAccountId),
        eq(bankAccounts.companyId, companyId)
      )
    )
    .limit(1);

  if (!account) throw new ValidationError("Cuenta bancaria no encontrada.");

  // 2. Sum reconciled transactions
  const reconciledResult = await db
    .select({
      sum: sql<string>`sum(${bankTransactions.amount})`
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccount, account.accountNumber || ''),
        eq(bankTransactions.status, 'reconciled')
      )
    );

  // 3. Count pending transactions
  const pendingResult = await db
    .select({
      count: sql<string>`count(*)`
    })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccount, account.accountNumber || ''),
        inArray(bankTransactions.status, ['pending', 'assigned'])
      )
    );

  const reconciledSum = Math.round(Number(reconciledResult[0]?.sum || 0) * 100);
  const currentBalance = account.initialBalance + reconciledSum;
  const pendingCount = Number(pendingResult[0]?.count || 0);

  return {
    initialBalance: account.initialBalance,
    reconciledSum,
    currentBalance,
    pendingCount
  };
}
