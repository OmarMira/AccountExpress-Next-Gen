// ============================================================
// INCOME STATEMENT (Profit & Loss)
// Measure revenues and expenses over a period.
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { db, sql } from "../../db/connection.ts";

export interface PnlItem {
  code: string;
  name: string;
  balance: number;
}

export interface IncomeStatementData {
  revenue: { items: PnlItem[]; total: number };
  cogs: { items: PnlItem[]; total: number };
  expenses: { items: PnlItem[]; total: number };
  grossProfit: number;
  netIncome: number;
  startDate: string;
  endDate: string;
}

export async function getIncomeStatement(companyId: string, startDate: string, endDate: string): Promise<IncomeStatementData> {
  const query = sql`
    SELECT
      ca.code,
      ca.name,
      ca.account_type as "account_type",
      ca.normal_balance as "normal_balance",
      COALESCE(SUM(jl.debit_amount), 0) as "total_debits",
      COALESCE(SUM(jl.credit_amount), 0) as "total_credits"
    FROM chart_of_accounts ca
    JOIN journal_lines jl ON ca.id = jl.account_id
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    WHERE ca.company_id = ${companyId} AND ca.is_active = true
      AND je.company_id = ${companyId}
      AND je.status IN ('posted', 'voided')
      AND je.entry_date >= ${startDate}::date AND je.entry_date <= ${endDate}::date
      AND ca.account_type IN ('revenue', 'expense')
    GROUP BY ca.id
    ORDER BY ca.code ASC
  `;

  const rows = await db.execute(query);

  const data: IncomeStatementData = {
    revenue: { items: [], total: 0 },
    cogs: { items: [], total: 0 },
    expenses: { items: [], total: 0 },
    grossProfit: 0,
    netIncome: 0,
    startDate,
    endDate
  };

  for (const row of rows) {
    const totalDebits = Number(row.total_debits || 0);
    const totalCredits = Number(row.total_credits || 0);

    const debits = Math.round(totalDebits * 100);
    const credits = Math.round(totalCredits * 100);
    
    let balanceCents = 0;
    if (row.normal_balance === "debit") {
      balanceCents = debits - credits;
    } else {
      balanceCents = credits - debits;
    }

    if (balanceCents === 0) continue;

    if (row.account_type === "revenue") {
      data.revenue.items.push({ code: row.code as string, name: row.name as string, balance: balanceCents / 100 });
      data.revenue.total += balanceCents;
    } else if (row.account_type === "expense") {
      if ((row.code as string).startsWith("50")) { // 5000 COGS conventionally
        data.cogs.items.push({ code: row.code as string, name: row.name as string, balance: balanceCents / 100 });
        data.cogs.total += balanceCents;
      } else {
        data.expenses.items.push({ code: row.code as string, name: row.name as string, balance: balanceCents / 100 });
        data.expenses.total += balanceCents;
      }
    }
  }

  data.grossProfit = data.revenue.total - data.cogs.total;
  data.netIncome = data.grossProfit - data.expenses.total;

  data.revenue.total /= 100;
  data.cogs.total /= 100;
  data.expenses.total /= 100;
  data.grossProfit /= 100;
  data.netIncome /= 100;

  return data;
}
