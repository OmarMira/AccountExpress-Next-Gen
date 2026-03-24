// ============================================================
// CASH FLOW
// Summarizes bank_transactions mapping inflows and outflows.
// ============================================================

import { rawDb } from "../../db/connection.ts";

export interface CashFlowData {
  inflows: number;
  outflows: number;
  netCashFlow: number;
  startDate: string;
  endDate: string;
}

export function getCashFlow(companyId: string, startDate: string, endDate: string): CashFlowData {
  // We use actual reconciled bank transactions because they represent real cash movements
  const query = `
    SELECT
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as inflows,
      COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) as outflows
    FROM bank_transactions
    WHERE company_id = ? 
      AND status = 'reconciled'
      AND transaction_date >= ? AND transaction_date <= ?
  `;

  const result = rawDb.query(query).get(companyId, startDate, endDate) as { inflows: number; outflows: number };
  
  const inflows = Math.round(result.inflows * 100);
  const outflows = Math.round(result.outflows * 100);

  return {
    inflows: inflows / 100,
    outflows: outflows / 100,
    netCashFlow: (inflows + outflows) / 100, // Outflows are inherently negative
    startDate,
    endDate
  };
}

