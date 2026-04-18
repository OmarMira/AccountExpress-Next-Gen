// ============================================================
// BALANCE SHEET — PostgreSQL 16 / Drizzle ORM
// Represents the financial position at a specific point in time.
// Assets = Liabilities + Equity
// ============================================================

import { db, sql } from "../../db/connection.ts";

export interface BalanceItem {
  code: string;
  name: string;
  balance: number; // Positive = normal balance format
}

export interface BalanceSheetData {
  assets: { items: BalanceItem[]; total: number };
  liabilities: { items: BalanceItem[]; total: number };
  equity: { items: BalanceItem[]; total: number };
  date: string;
  warning?: string;
}

export async function getBalanceSheet(companyId: string, asOfDate: string): Promise<BalanceSheetData> {
  // Query to get all balances up to asOfDate
  interface BalanceSheetRow {
    code:           string;
    name:           string;
    account_type:   string;
    normal_balance: string;
    total_debits:   string;
    total_credits:  string;
  }

  const query = sql`
    SELECT
      ca.code,
      ca.name,
      ca.account_type as "account_type",
      ca.normal_balance as "normal_balance",
      COALESCE(SUM(jl.debit_amount), 0) as "total_debits",
      COALESCE(SUM(jl.credit_amount), 0) as "total_credits"
    FROM chart_of_accounts ca
    LEFT JOIN journal_lines jl ON ca.id = jl.account_id
    LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id
      AND je.company_id = ${companyId}
      AND je.status IN ('posted', 'voided')
      AND je.entry_date <= ${asOfDate}
    WHERE ca.company_id = ${companyId} AND ca.is_active = true
    GROUP BY ca.id
    ORDER BY ca.code ASC
  `;

  const rows = await db.execute(query) as unknown as BalanceSheetRow[];

  const data: BalanceSheetData = {
    assets: { items: [], total: 0 },
    liabilities: { items: [], total: 0 },
    equity: { items: [], total: 0 },
    date: asOfDate,
  };

  let netIncomeCents = 0;

  for (const row of rows) {
    const totalDebits = Number(row.total_debits || 0);
    const totalCredits = Number(row.total_credits || 0);

    const debits = Math.round(totalDebits * 100);
    const credits = Math.round(totalCredits * 100);
    
    // Balance calculation based on normal balance relative to account type
    let balanceCents = 0;
    if (row.normal_balance === "debit") {
      balanceCents = debits - credits;
    } else {
      balanceCents = credits - debits;
    }

    if (row.account_type === "asset") {
      if (balanceCents !== 0) {
        data.assets.items.push({ code: row.code, name: row.name, balance: balanceCents / 100 });
        data.assets.total += balanceCents;
      }
    } else if (row.account_type === "liability") {
      if (balanceCents !== 0) {
        data.liabilities.items.push({ code: row.code, name: row.name, balance: balanceCents / 100 });
        data.liabilities.total += balanceCents;
      }
    } else if (row.account_type === "equity") {
      if (balanceCents !== 0) {
        data.equity.items.push({ code: row.code, name: row.name, balance: balanceCents / 100 });
        data.equity.total += balanceCents;
      }
    } else if (row.account_type === "revenue") {
        netIncomeCents += balanceCents; // Revenue is credit normal
    } else if (row.account_type === "expense") {
        netIncomeCents -= balanceCents; // Expense is debit normal, reduces net income
    }
  }

  // Inject Current Year Earnings into Equity dynamically
  if (netIncomeCents !== 0) {
    data.equity.items.push({ code: "3950", name: "Current Year Earnings (Dynamic)", balance: netIncomeCents / 100 });
    data.equity.total += netIncomeCents;
  }

  // Strict Accounting Equation Verifier: Assets === Liabilities + Equity
  // NOTE: comparison operates on cent integers BEFORE the /100 conversions below.
  if (data.assets.total !== (data.liabilities.total + data.equity.total)) {
    const diff = (data.assets.total - (data.liabilities.total + data.equity.total)) / 100;
    data.warning = `UNBALANCED BALANCE SHEET: Equation off by ${diff.toFixed(2)}. Check for orphan journal lines.`;
  }

  // Format finals back to floats
  data.assets.total /= 100;
  data.liabilities.total /= 100;
  data.equity.total /= 100;

  return data;
}
