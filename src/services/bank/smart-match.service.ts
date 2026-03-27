// ============================================================
// SMART MATCHER
// Probabilistic analysis mapping generic Bank descriptions 
// to exact COA account IDs via historical reconciliation records.
// ============================================================

import { rawDb } from "../../db/connection.ts";

export interface MatchSuggestion {
  accountId: string;
  confidence: number;
}

// ── Pattern Matching Matrix ─────────────────────────────────
export function suggestAccount(
  companyId: string,
  description: string
): MatchSuggestion[] {
  // Strict deterministic search against previously reconciled descriptions
  const cleanDesc = description.trim().toLowerCase();

  // Find occurrences of this exact/prefix description in previously matched transactions
  const records = rawDb.query(
    `SELECT jl.account_id, COUNT(*) as frequency
     FROM bank_transactions bt
     JOIN journal_entries je ON bt.journal_entry_id = je.id
     JOIN journal_lines jl ON je.id = jl.journal_entry_id
     WHERE bt.company_id = ? AND bt.status = 'reconciled'
       AND LOWER(bt.description) LIKE ?
       AND jl.debit_amount > 0 -- Mapping the expense/revenue leg (excluding the bank leg)
     GROUP BY jl.account_id
     ORDER BY frequency DESC`
  ).all(companyId, `%${cleanDesc.substring(0, 10)}%`) as { account_id: string; frequency: number }[];

  if (records.length === 0) {
    return []; // Confidence 0 (No array entries)
  }

  const highestFreq = records[0].frequency;
  
  return records.map(r => ({
    accountId: r.account_id,
    confidence: highestFreq > 0 
      ? Math.min((r.frequency / highestFreq) * 100, 95) 
      : 0
  }));
}

