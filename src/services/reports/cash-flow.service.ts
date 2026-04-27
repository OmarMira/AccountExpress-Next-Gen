// ============================================================
// CASH FLOW
// Summarizes bank_transactions mapping inflows and outflows.
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { db, sql } from "../../db/connection.ts";
import { bankTransactions } from "../../db/schema/index.ts";
import { and, eq, gte, lte } from "drizzle-orm";

export interface CashFlowData {
  inflows: number;
  outflows: number;
  netCashFlow: number;
  startDate: string;
  endDate: string;
}

export async function getCashFlow(companyId: string, startDate: string, endDate: string): Promise<CashFlowData> {
  // We use actual reconciled bank transactions because they represent real cash movements

  // Actually, Drizzle allows a simpler pure ORM approach here, but sticking to execute for exact compatibility:
  const query2 = sql`
    SELECT
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as "inflows",
      COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) as "outflows"
    FROM bank_transactions
    WHERE company_id = ${companyId} 
      AND status = 'reconciled'
      AND transaction_date >= ${startDate}::date AND transaction_date <= ${endDate}::date
  `;

  interface InflowOutflowRow {
    inflows:  string;
    outflows: string;
  }

  const rows = await db.execute(query2) as unknown as InflowOutflowRow[];
  const result = rows[0] || { inflows: "0", outflows: "0" };
  
  const totalInflows = Number(result.inflows || 0);
  const totalOutflows = Number(result.outflows || 0);

  const inflows = Math.round(totalInflows * 100);
  const outflows = Math.round(totalOutflows * 100);

  return {
    inflows: inflows / 100,
    outflows: outflows / 100,
    netCashFlow: (inflows + outflows) / 100, // Outflows are inherently negative
    startDate,
    endDate
  };
}
