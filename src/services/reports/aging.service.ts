// ============================================================
// AGING REPORT SERVICE — PostgreSQL 16 / Drizzle ORM
// Classifies pending bank transactions by age buckets.
// 0-30 days, 31-60 days, 61-90 days, 90+ days.
// ============================================================

import { db, sql } from "../../db/connection.ts";

export interface AgingTransaction {
  id: string;
  transactionDate: string;
  description: string;
  amount: number;
  daysPending: number;
  bankAccount: string;
}

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  total: number;
  transactions: AgingTransaction[];
}

export interface AgingReport {
  companyId: string;
  asOfDate: string;
  totalPending: number;
  totalAmount: number;
  buckets: AgingBucket[];
}

export async function getAgingReport(
  companyId: string,
  asOfDate: string
): Promise<AgingReport> {
  interface AgingRow {
    id:              string;
    bankAccount:     string;
    transactionDate: string;
    description:     string;
    amount:          number;
    daysPending:     number;
  }

  const rows = await db.execute(sql`
    SELECT
      id,
      bank_account as "bankAccount",
      transaction_date as "transactionDate",
      description,
      amount::numeric::float8 as "amount",
      CURRENT_DATE - created_at::date as "daysPending"
    FROM bank_transactions
    WHERE company_id = ${companyId}
      AND status = 'pending'
      AND created_at::date <= ${asOfDate}::date
    ORDER BY created_at ASC
  `) as unknown as AgingRow[];

  const buckets: AgingBucket[] = [
    { label: "0-30 days",  minDays: 0,  maxDays: 30,  count: 0, total: 0, transactions: [] },
    { label: "31-60 days", minDays: 31, maxDays: 60,  count: 0, total: 0, transactions: [] },
    { label: "61-90 days", minDays: 61, maxDays: 90,  count: 0, total: 0, transactions: [] },
    { label: "90+ days",   minDays: 91, maxDays: null, count: 0, total: 0, transactions: [] },
  ];

  let totalAmount = 0;

  for (const row of rows) {
    const days = Number(row.daysPending ?? 0);
    const amount = Number(row.amount ?? 0);
    totalAmount += Math.abs(amount);

    const tx: AgingTransaction = {
      id: row.id,
      transactionDate: row.transactionDate,
      description: row.description,
      amount,
      daysPending: days,
      bankAccount: row.bankAccount,
    };

    const bucket = buckets.find(
      (b) => days >= b.minDays && (b.maxDays === null || days <= b.maxDays)
    );

    if (bucket) {
      bucket.transactions.push(tx);
      bucket.count++;
      bucket.total += Math.abs(amount);
    }
  }

  return {
    companyId,
    asOfDate,
    totalPending: rows.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    buckets: buckets.map((b) => ({
      ...b,
      total: Math.round(b.total * 100) / 100,
    })),
  };
}
