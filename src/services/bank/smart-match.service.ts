// ============================================================
// SMART MATCHER
// Probabilistic analysis mapping generic Bank descriptions 
// to exact COA account IDs via historical reconciliation records.
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { db, sql } from "../../db/connection.ts";
import { bankTransactions, journalEntries, journalLines } from "../../db/schema/index.ts";
import { eq, and, like } from "drizzle-orm";

export interface MatchSuggestion {
  accountId: string;
  confidence: number;
}

// ── Pattern Matching Matrix ─────────────────────────────────
export async function suggestAccount(
  companyId: string,
  description: string
): Promise<MatchSuggestion[]> {
  // Strict deterministic search against previously reconciled descriptions
  const cleanDesc = description.trim().toLowerCase();
  const searchPattern = `%${cleanDesc.substring(0, 10)}%`;

  // Find occurrences of this exact/prefix description in previously matched transactions
  const recordsQuery = sql`
    SELECT jl.account_id as "account_id", COUNT(*)::int as "frequency"
    FROM bank_transactions bt
    JOIN journal_entries je ON bt.journal_entry_id = je.id
    JOIN journal_lines jl ON je.id = jl.journal_entry_id
    WHERE bt.company_id = ${companyId} AND bt.status = 'reconciled'
      AND LOWER(bt.description) LIKE ${searchPattern}
      AND jl.debit_amount > 0 -- Mapping the expense/revenue leg (excluding the bank leg)
    GROUP BY jl.account_id
    ORDER BY "frequency" DESC
  `;

  const records = await db.execute(recordsQuery);

  if (records.length === 0) {
    return []; // Confidence 0 (No array entries)
  }

  const highestFreq = records[0].frequency as number;
  
  return records.map(r => ({
    accountId: r.account_id as string,
    confidence: highestFreq > 0 
      ? Math.min(((r.frequency as number) / highestFreq) * 100, 95) 
      : 0
  }));
}
