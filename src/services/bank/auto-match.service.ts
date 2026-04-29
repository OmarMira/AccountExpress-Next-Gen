// ============================================================
// AUTO-MATCH SERVICE — Level 1: Smart-match auto-reconciliation
// Uses pg_trgm fuzzy suggestions to automatically reconcile
// pending bank transactions when confidence is unambiguous.
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { db } from "../../db/connection.ts";
import { 
  bankTransactions, 
  bankAccounts, 
  bankRules, 
  fiscalPeriods,
  journalLines,
  journalEntries
} from "../../db/schema/index.ts";
import { and, eq, or, isNull, sql, between, inArray } from "drizzle-orm";
import { matchTransaction, matchAgainstJournal } from "./reconciliation.service.ts";
import { suggestAccountBatch } from "./smart-match.service.ts";
import { createGroup, reconcileGroup } from "./reconciliation-group.service.ts";



const AUTO_MATCH_CONFIDENCE_THRESHOLD = 0.70;
const MAX_SUGGESTIONS_FOR_GROUP       = 3;
const DEFAULT_BATCH_LIMIT             = 100;

export interface AutoMatchResult {
  matched: number;
  crossed: number;
  pending: number;
  errors: { transactionId: string; reason: string }[];
}


// ── Helper: resolve GL account ID from bank_accounts.id ─────
async function resolveGlAccountId(
  bankAccountId: string,
  companyId: string
): Promise<string | null> {
  const [account] = await db
    .select({ glAccountId: bankAccounts.glAccountId })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, bankAccountId),
        eq(bankAccounts.companyId, companyId),
        eq(bankAccounts.isActive, true)
      )
    )
    .limit(1);
  return account?.glAccountId ?? null;
}

// ── Helper: Verify Period Status ─────────────────────────────
async function checkPeriodOpen(companyId: string, periodId: string) {
  const [period] = await db
    .select({ status: fiscalPeriods.status })
    .from(fiscalPeriods)
    .where(and(eq(fiscalPeriods.id, periodId), eq(fiscalPeriods.companyId, companyId)))
    .limit(1);

  if (!period) {
    throw new Error("El periodo fiscal especificado no existe.");
  }
  if (period.status !== "open") {
    throw new Error(`No se puede ejecutar conciliación automática en un periodo ${period.status}.`);
  }
}

// ── Helper: Get Closed Periods ────────────────────────────────
async function getClosedPeriodFilter(companyId: string) {
  const closed = await db
    .select({ startDate: fiscalPeriods.startDate, endDate: fiscalPeriods.endDate })
    .from(fiscalPeriods)
    .where(
      and(
        eq(fiscalPeriods.companyId, companyId),
        inArray(fiscalPeriods.status, ["closed", "locked"])
      )
    );
  
  return (date: string) => closed.some(p => date >= p.startDate && date <= p.endDate);
}

// ── Level 1: Auto-reconcile via high-confidence smart-match ─
export async function runAutoMatch(
  companyId: string,
  bankAccountId: string,
  periodId: string,
  userId: string,
  sessionId: string,
  ipAddress: string,
  limit: number = DEFAULT_BATCH_LIMIT
): Promise<AutoMatchResult> {
  const result: AutoMatchResult = { matched: 0, crossed: 0, pending: 0, errors: [] };

  // 0. Security: Verify target period is OPEN
  await checkPeriodOpen(companyId, periodId);
  const isDateClosed = await getClosedPeriodFilter(companyId);

  // 1. Resolve the bank's GL account (e.g., 1010 - Cash Checking)
  const bankGlAccountId = await resolveGlAccountId(bankAccountId, companyId);
  if (!bankGlAccountId) {
    result.errors.push({
      transactionId: bankAccountId,
      reason:
        "Bank account has no GL account assigned. Assign a GL account to this bank account before running auto-match.",
    });
    return result;
  }

  // 1.6. Rule-based match: apply active bank rules to ALL pending transactions
  const activeRules = await db
    .select()
    .from(bankRules)
    .where(
      and(
        eq(bankRules.companyId, companyId),
        eq(bankRules.isActive, true)
      )
    )
    .orderBy(bankRules.priority);

  const allPendingForRules = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccount, bankAccountId),
        or(
          eq(bankTransactions.status, "pending"),
          isNull(bankTransactions.glAccountId)
        )
      )
    )
    .limit(limit);

  // UX Requirement: Ignore transactions in closed periods
  const pendingForRules = allPendingForRules.filter(tx => !isDateClosed(tx.transactionDate));

  // Set initial pending count to the total found
  result.pending = pendingForRules.length;

  for (const tx of pendingForRules) {
    const txAmountNum = Number(tx.amount);
    const absAmountStr = Math.abs(txAmountNum).toFixed(2);

    // --- LEVEL 0: Exact Ledger Match (Cross-match existing JE) ---
    // Rule: Same amount, same account, posted status, not reconciled, date within +/- 7 days
    const txDateObj = new Date(tx.transactionDate + 'T12:00:00Z');
    const dStart = new Date(txDateObj);
    dStart.setDate(dStart.getDate() - 7);
    const dEnd = new Date(txDateObj);
    dEnd.setDate(dEnd.getDate() + 7);
    
    const dateStart = dStart.toISOString().split('T')[0];
    const dateEnd = dEnd.toISOString().split('T')[0];


    const existingMatch = await db
      .select({
        lineId: journalLines.id,
        entryId: journalLines.journalEntryId
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.companyId, companyId),
          eq(journalLines.accountId, bankGlAccountId),
          eq(journalLines.isReconciled, false),
          eq(journalEntries.status, 'posted'),
          txAmountNum > 0 
            ? eq(journalLines.debitAmount, absAmountStr)
            : eq(journalLines.creditAmount, absAmountStr),
          between(journalEntries.entryDate, dateStart, dateEnd)
        )
      )
      .limit(1);

    if (existingMatch.length > 0) {
      try {
        await matchAgainstJournal({
          companyId,
          transactionId: tx.id,
          lineIds: [existingMatch[0].lineId],
          userId,
          sessionId,
          ipAddress
        });
        result.crossed++;
        continue; // Successfully crossed, skip rule matching
      } catch (err: any) {

        // Log error but continue to try rules if cross-match failed for some reason
        console.error(`Ledger match failed for tx ${tx.id}: ${err.message}`);
      }
    }

    const desc = (tx.description ?? "").toUpperCase();

    // Find first matching rule by priority

    const matchingRule = activeRules.find(rule => {
      const val = rule.conditionValue.toUpperCase();
      const dirMatch =
        rule.transactionDirection === "any" ||
        (rule.transactionDirection === "debit"  && tx.transactionType === "debit") ||
        (rule.transactionDirection === "credit" && tx.transactionType === "credit");
      if (!dirMatch) return false;
      if (rule.conditionType === "contains")    return desc.includes(val);
      if (rule.conditionType === "starts_with") return desc.startsWith(val);
      if (rule.conditionType === "equals")      return desc === val;
      return false;
    });

    if (!matchingRule) continue;

    try {
      await matchTransaction(
        companyId,
        tx.id,
        matchingRule.glAccountId,
        bankGlAccountId,
        periodId,
        userId,
        sessionId,
        ipAddress,
        matchingRule.id,
        'auto_matched'
      );
      result.matched++;
      result.pending--;
    } catch (err: unknown) {
      result.errors.push({
        transactionId: tx.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 1.5. Deterministic Rules: Process transactions marked as 'autoAdd'
  const allAutoAddTxs = await db
    .select({
      transaction: bankTransactions
    })
    .from(bankTransactions)
    .innerJoin(bankRules, eq(bankTransactions.appliedRuleId, bankRules.id))
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccount, bankAccountId),
        eq(bankTransactions.status, "assigned"),
        eq(bankRules.autoAdd, true),
        eq(bankRules.isActive, true)
      )
    )
    .limit(limit);

  const autoAddTxs = allAutoAddTxs.filter(item => !isDateClosed(item.transaction.transactionDate));

  for (const item of autoAddTxs) {
    const tx = item.transaction;
    try {
      if (!tx.glAccountId) {
        throw new Error("Assigned transaction is missing GL account ID");
      }

      await matchTransaction(
        companyId,
        tx.id,
        tx.glAccountId,
        bankGlAccountId,
        periodId,
        userId,
        sessionId,
        ipAddress,
        tx.appliedRuleId ?? undefined,
        'auto_matched'
      );
      result.matched++;
    } catch (err: any) {
      result.errors.push({ transactionId: tx.id, reason: `Rule match failed: ${err.message}` });
    }
  }

  // 2. Get all pending transactions for this bank account
  const allPendingTxs = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccount, bankAccountId),
        eq(bankTransactions.status, "pending")
      )
    )
    .limit(limit);

  const pendingTxs = allPendingTxs.filter(tx => !isDateClosed(tx.transactionDate));

  if (pendingTxs.length === 0) return result;

  // 3. Batch fuzzy suggestions for all pending descriptions
  const descriptions = pendingTxs.map(tx => tx.description ?? "");
  const suggestions  = await suggestAccountBatch(companyId, descriptions);

  // 4. Attempt auto-reconciliation for unambiguous matches
  for (const tx of pendingTxs) {
    const desc           = tx.description ?? "";
    const txSuggestions  = suggestions.get(desc) ?? [];

    // Filter suggestions above the confidence threshold
    const highConfidence = txSuggestions.filter(
      s => s.confidence >= AUTO_MATCH_CONFIDENCE_THRESHOLD
    );

    // Only proceed if exactly one high-confidence suggestion exists
    if (highConfidence.length !== 1) {
      result.pending++;
      continue;
    }

    const targetAccountId = highConfidence[0].accountId;

    try {
      await matchTransaction(
        companyId,
        tx.id,
        targetAccountId,   // expense / revenue GL account
        bankGlAccountId,   // bank's own GL account (e.g., 1010 Cash)
        periodId,
        userId,
        sessionId,
        ipAddress,
        undefined,
        'auto_matched'
      );
      result.matched++;
      result.pending--;
    } catch (err: unknown) {
      result.errors.push({
        transactionId: tx.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ── Level 2: Group transactions sharing the same GL suggestion ─
export async function runGroupMatch(
  companyId: string,
  bankAccountId: string,
  periodId: string,
  userId: string,
  sessionId: string,
  ipAddress: string,
  limit: number = DEFAULT_BATCH_LIMIT
): Promise<AutoMatchResult> {
  const result: AutoMatchResult = { matched: 0, pending: 0, crossed: 0, errors: [] };

  // 0. Security & UX: Verify target period and closed periods
  await checkPeriodOpen(companyId, periodId);
  const isDateClosed = await getClosedPeriodFilter(companyId);

  // 1. Resolve bank GL account
  const bankGlAccountId = await resolveGlAccountId(bankAccountId, companyId);
  if (!bankGlAccountId) {
    result.errors.push({
      transactionId: bankAccountId,
      reason: "Bank account has no GL account assigned.",
    });
    return result;
  }

  // 2. Get transactions still pending after Level 1
  const allPendingTxs = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccount, bankAccountId),
        or(
          eq(bankTransactions.status, "pending"),
          isNull(bankTransactions.glAccountId)
        )
      )
    )
    .limit(limit);

  const pendingTxs = allPendingTxs.filter(tx => !isDateClosed(tx.transactionDate));

  if (pendingTxs.length === 0) return result;

  // 3. Get suggestions for remaining transactions
  const descriptions = pendingTxs.map(tx => tx.description ?? "");
  const suggestions  = await suggestAccountBatch(companyId, descriptions);

  // 4. Group transactions by their top suggestion (if any)
  const groups = new Map<string, typeof pendingTxs>();

  for (const tx of pendingTxs) {
    const desc          = tx.description ?? "";
    const txSuggestions = (suggestions.get(desc) ?? []).slice(0, MAX_SUGGESTIONS_FOR_GROUP);

    if (txSuggestions.length === 0) {
      continue;
    }

    const topAccountId = txSuggestions[0].accountId;
    const existing     = groups.get(topAccountId) ?? [];
    existing.push(tx);
    groups.set(topAccountId, existing);
  }

  // 5. Reconcile each group
  for (const [glAccountId, txGroup] of groups.entries()) {
    if (txGroup.length < 2) {
      continue;
    }

    try {
      const { groupId } = await createGroup({
        companyId,
        description: `Auto-match grupo: ${txGroup.length} transacciones`,
        transactionIds: txGroup.map(tx => tx.id),
        glAccountId,
      });

      await reconcileGroup({
        groupId,
        companyId,
        periodId,
        userId,
        sessionId,
        ipAddress,
        bankAccountGlId: bankGlAccountId,
        source: 'auto_matched'
      });

      result.matched += txGroup.length;
    } catch (err: unknown) {
      for (const tx of txGroup) {
        result.errors.push({
          transactionId: tx.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return result;
}
