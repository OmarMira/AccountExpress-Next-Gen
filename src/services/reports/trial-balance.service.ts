// ============================================================
// TRIAL BALANCE — PostgreSQL 16 / Drizzle ORM
// Unadjusted/Adjusted trial balance ensuring Total Debits = Total Credits
// ============================================================

import { db, sql } from "../../db/connection.ts";
import { ValidationError as AccountingError } from "../journal.service.ts";

export interface TrialBalanceItem {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

export interface TrialBalanceData {
  items: TrialBalanceItem[];
  totalDebits: number;
  totalCredits: number;
  warning?: string;
}

export async function getTrialBalance(companyId: string, asOfDate: string): Promise<TrialBalanceData> {
  const query = sql`
    SELECT
      ca.code,
      ca.name,
      ca.normal_balance as "normal_balance",
      COALESCE(SUM(jl.debit_amount), 0) as "total_debits",
      COALESCE(SUM(jl.credit_amount), 0) as "total_credits"
    FROM chart_of_accounts ca
    JOIN journal_lines jl ON ca.id = jl.account_id
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    WHERE ca.company_id = ${companyId} AND ca.is_active = true
      AND je.company_id = ${companyId}
      AND je.status IN ('posted', 'voided')
      AND je.entry_date <= ${asOfDate}::date
    GROUP BY ca.id
    ORDER BY ca.code ASC
  `;

  const rows = await db.execute(query);

  const items: TrialBalanceItem[] = [];
  let sumDebitsCents = 0;
  let sumCreditsCents = 0;

  for (const row of rows) {
    const totalDebits = Number(row.total_debits || 0);
    const totalCredits = Number(row.total_credits || 0);

    const debits = Math.round(totalDebits * 100);
    const credits = Math.round(totalCredits * 100);

    const net = debits - credits; // Positive = Debit bound, Negative = Credit bound
    
    if (net > 0) {
      items.push({ code: row.code as string, name: row.name as string, debit: net / 100, credit: 0 });
      sumDebitsCents += net;
    } else if (net < 0) {
      items.push({ code: row.code as string, name: row.name as string, debit: 0, credit: Math.abs(net) / 100 });
      sumCreditsCents += Math.abs(net);
    } else {
      items.push({ code: row.code as string, name: row.name as string, debit: 0, credit: 0 });
    }
  }

  const data: TrialBalanceData = {
    items,
    totalDebits: sumDebitsCents / 100,
    totalCredits: sumCreditsCents / 100,
  };

  if (sumDebitsCents !== sumCreditsCents) {
    const diff = Math.abs(sumDebitsCents - sumCreditsCents) / 100;
    data.warning = `UNBALANCED TRIAL BALANCE: Debits and Credits differ by ${diff.toFixed(2)}. Check for orphan journal lines.`;
  }

  return data;
}
