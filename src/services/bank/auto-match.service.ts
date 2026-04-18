// ============================================================
// AUTO-MATCH SERVICE — Level 1: Smart-match auto-reconciliation
// Uses pg_trgm fuzzy suggestions to automatically reconcile
// pending bank transactions when confidence is unambiguous.
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { db } from "../../db/connection.ts";
import { bankTransactions, bankAccounts, bankRules } from "../../db/schema/index.ts";
import { eq, and } from "drizzle-orm";
import { matchTransaction } from "./reconciliation.service.ts";
import { suggestAccountBatch } from "./smart-match.service.ts";
import { createGroup, reconcileGroup } from "./reconciliation-group.service.ts";

const AUTO_MATCH_CONFIDENCE_THRESHOLD = 0.70;
const MAX_SUGGESTIONS_FOR_GROUP       = 3;

export interface AutoMatchResult {
  matched: number;
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

// ── Level 1: Auto-reconcile via high-confidence smart-match ─
export async function runAutoMatch(
  companyId: string,
  bankAccountId: string,
  periodId: string,
  userId: string,
  sessionId: string,
  ipAddress: string
): Promise<AutoMatchResult> {
  const result: AutoMatchResult = { matched: 0, pending: 0, errors: [] };

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

  // 1.5. Deterministic Rules: Process transactions marked as 'autoAdd'
  const autoAddTxs = await db
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
    );

  for (const item of autoAddTxs) {
    const tx = item.transaction;
    try {
      if (!tx.glAccountId) {
        throw new Error("Assigned transaction is missing GL account ID");
      }

      await matchTransaction(
        {
          transactionId: tx.id,
          glAccountId: tx.glAccountId,
          periodId,
          bankGlAccountId,
          description: tx.description
        },
        userId,
        sessionId,
        ipAddress
      );
      result.matched++;
    } catch (err: any) {
      result.errors.push({ transactionId: tx.id, reason: `Rule match failed: ${err.message}` });
    }
  }

  // 2. Get all pending transactions for this bank account
  const pendingTxs = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccount, bankAccountId),
        eq(bankTransactions.status, "pending")
      )
    );

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
        ipAddress
      );
      result.matched++;
    } catch (err: unknown) {
      result.errors.push({
        transactionId: tx.id,
        reason: err instanceof Error ? err.message : String(err),
      });
      result.pending++;
    }
  }

  return result;
}

// ── Level 2: Group transactions sharing the same GL suggestion ─
// Targets transactions Level 1 left pending due to ambiguous
// confidence, grouping those that share a dominant suggestion.
export async function runGroupMatch(
  companyId: string,
  bankAccountId: string,
  periodId: string,
  userId: string,
  sessionId: string,
  ipAddress: string
): Promise<AutoMatchResult> {
  const result: AutoMatchResult = { matched: 0, pending: 0, errors: [] };

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
  const pendingTxs = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccount, bankAccountId),
        eq(bankTransactions.status, "pending")
      )
    );

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
      result.pending++;
      continue;
    }

    // Use the highest-confidence suggestion as the grouping key
    const topAccountId = txSuggestions[0].accountId;
    const existing     = groups.get(topAccountId) ?? [];
    existing.push(tx);
    groups.set(topAccountId, existing);
  }

  // 5. Reconcile each group (minimum 2 transactions to justify grouping)
  for (const [glAccountId, txGroup] of groups.entries()) {
    if (txGroup.length < 2) {
      result.pending += txGroup.length;
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
      });

      result.matched += txGroup.length;
    } catch (err: unknown) {
      for (const tx of txGroup) {
        result.errors.push({
          transactionId: tx.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
      result.pending += txGroup.length;
    }
  }

  return result;
}
