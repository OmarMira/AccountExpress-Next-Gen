// ============================================================
// TRIAL BALANCE
// Unadjusted/Adjusted trial balance ensuring Total Debits = Total Credits
// ============================================================

import { rawDb } from "../../db/connection.ts";
import { ValidationError as AccountingError } from "../journal.service.ts";

export interface TrialBalanceItem {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

export function getTrialBalance(companyId: string, asOfDate: string): { items: TrialBalanceItem[], totalDebits: number, totalCredits: number } {
  const query = `
    SELECT
      ca.code,
      ca.name,
      ca.normal_balance,
      COALESCE(SUM(jl.debit_amount), 0) as total_debits,
      COALESCE(SUM(jl.credit_amount), 0) as total_credits
    FROM chart_of_accounts ca
    JOIN journal_lines jl ON ca.id = jl.account_id
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    WHERE ca.company_id = ? AND ca.is_active = 1
      AND je.company_id = ?
      AND je.status IN ('posted', 'voided')
      AND je.entry_date <= ?
    GROUP BY ca.id
    ORDER BY ca.code ASC
  `;

  const rows = rawDb.query(query).all(companyId, companyId, asOfDate) as any[];

  const items: TrialBalanceItem[] = [];
  let sumDebitsCents = 0;
  let sumCreditsCents = 0;

  for (const row of rows) {
    const debits = Math.round(row.total_debits * 100);
    const credits = Math.round(row.total_credits * 100);

    const net = debits - credits; // Positive = Debit bound, Negative = Credit bound
    
    if (net > 0) {
      items.push({ code: row.code, name: row.name, debit: net / 100, credit: 0 });
      sumDebitsCents += net;
    } else if (net < 0) {
      items.push({ code: row.code, name: row.name, debit: 0, credit: Math.abs(net) / 100 });
      sumCreditsCents += Math.abs(net);
    } else {
      items.push({ code: row.code, name: row.name, debit: 0, credit: 0 });
    }
  }

  if (sumDebitsCents !== sumCreditsCents) {
    throw new AccountingError(`TRIAL BALANCE ERROR: Debits (${sumDebitsCents / 100}) and Credits (${sumCreditsCents / 100}) do not match.`);
  }

  return { items, totalDebits: sumDebitsCents / 100, totalCredits: sumCreditsCents / 100 };
}

