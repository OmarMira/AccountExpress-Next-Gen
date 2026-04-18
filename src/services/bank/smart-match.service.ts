// ============================================================
// SMART MATCH SERVICE — pg_trgm fuzzy matching
// Suggests GL accounts for bank transactions using:
//   1. Historical reconciliation patterns (similarity on description)
//   2. Direct similarity against chart of accounts names
// PostgreSQL 16 / Drizzle ORM + pg_trgm extension required
// ============================================================

import { db, sql } from "../../db/connection.ts";

const FUZZY_SIMILARITY_THRESHOLD = 0.3;
const MAX_SUGGESTIONS_PER_TX     = 5;

export interface MatchSuggestion {
  accountId:  string;
  confidence: number;          // 0.0 – 0.95 (pg_trgm similarity score)
  source:     "history" | "catalog";
}

export async function suggestAccountBatch(
  companyId: string,
  descriptions: string[]
): Promise<Map<string, MatchSuggestion[]>> {
  if (descriptions.length === 0) return new Map();

  const result = new Map<string, MatchSuggestion[]>();

  for (const description of descriptions) {
    interface FuzzyRow {
      accountId: string;
      score:     string;
      source:    string;
    }

    const rows = await db.execute(sql`
      SELECT * FROM (
        SELECT
          jl.account_id          AS "accountId",
          similarity(bt.description, ${description})::text AS "score",
          'history'::text        AS "source"
        FROM bank_transactions bt
        JOIN journal_entries je ON bt.journal_entry_id = je.id
        JOIN journal_lines   jl ON je.id = jl.journal_entry_id
        WHERE bt.company_id = ${companyId}
          AND bt.status     = 'reconciled'
          AND similarity(bt.description, ${description}) >= ${FUZZY_SIMILARITY_THRESHOLD}
          AND jl.debit_amount > 0

        UNION ALL

        SELECT
          ca.id                   AS "accountId",
          similarity(ca.name, ${description})::text AS "score",
          'catalog'::text         AS "source"
        FROM chart_of_accounts ca
        WHERE ca.company_id = ${companyId}
          AND ca.is_active  = true
          AND similarity(ca.name, ${description}) >= ${FUZZY_SIMILARITY_THRESHOLD}
      ) combined
      ORDER BY "score"::float DESC
      LIMIT ${MAX_SUGGESTIONS_PER_TX}
    `) as unknown as FuzzyRow[];

    result.set(description, rows.map(r => ({
      accountId:  r.accountId,
      confidence: Math.min(parseFloat(r.score), 0.95),
      source:     r.source as "history" | "catalog",
    })));
  }

  return result;
}
