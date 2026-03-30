import { db, sql } from "../../db/connection.ts";

export interface MatchSuggestion {
  accountId: string;
  confidence: number;
}

export async function suggestAccountBatch(
  companyId: string,
  descriptions: string[]
): Promise<Map<string, MatchSuggestion[]>> {
  if (descriptions.length === 0) return new Map();

  const unique = [...new Set(descriptions.map(d => d.trim().toLowerCase()))];

  const patterns = unique.map(d => `%${d.substring(0, 10)}%`);

  const recordsQuery = sql`
    SELECT
      bt.description as "rawDescription",
      jl.account_id as "accountId",
      COUNT(*)::int as "frequency"
    FROM bank_transactions bt
    JOIN journal_entries je ON bt.journal_entry_id = je.id
    JOIN journal_lines jl ON je.id = jl.journal_entry_id
    WHERE bt.company_id = ${companyId}
      AND bt.status = 'reconciled'
      AND LOWER(bt.description) LIKE ANY(ARRAY[${sql.join(patterns.map(p => sql`${p}`), sql`, `)}])
      AND jl.debit_amount > 0
    GROUP BY bt.description, jl.account_id
    ORDER BY "frequency" DESC
  `;

  const records = await db.execute(recordsQuery);

  const grouped = new Map<string, { accountId: string; frequency: number }[]>();
  for (const r of records) {
    const key = (r.rawDescription as string).trim().toLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({
      accountId: r.accountId as string,
      frequency: r.frequency as number,
    });
  }

  const result = new Map<string, MatchSuggestion[]>();
  for (const desc of descriptions) {
    const key = desc.trim().toLowerCase();
    const matches = grouped.get(key) ?? [];
    const highestFreq = matches[0]?.frequency ?? 0;
    result.set(desc, matches.map(m => ({
      accountId: m.accountId,
      confidence: highestFreq > 0
        ? Math.min((m.frequency / highestFreq) * 100, 95)
        : 0,
    })));
  }

  return result;
}
