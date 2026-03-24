// ============================================================
// CPA SUMMARY (TAX EXPORT)
// Exposes restricted Tax formats strictly grouping data by IRS
// tax_category bindings.
// ============================================================

import { rawDb } from "../../db/connection.ts";
import { ValidationError as AccountingError } from "../journal.service.ts";
import { getPeriod } from "../fiscal-period.service.ts";
import { verifyAuditChain } from "../audit.service.ts";

export interface TaxLine {
  taxCategory: string;
  totalBalance: number;
}

export interface CpaSummary {
  companyId: string;
  periodId: string;
  disclaimer: string;
  hashTimestamp: string;
  sha256ChainResult: string;
  rfc3161_token_hex: string | null;
  taxes: TaxLine[];
}

export function generateCpaSummary(companyId: string, periodId: string): CpaSummary {
  // 1. Verify period is closed
  const period = getPeriod(periodId);
  if (!period) throw new AccountingError("Period not found");
  if (period.status !== "closed") {
    throw new AccountingError("CPA Export is exclusively allowed for CLOSED fiscal periods.");
  }

  // 2. Aggregate P&L accounts by tax_category
  const query = `
    SELECT
      ca.tax_category,
      COALESCE(SUM(jl.debit_amount), 0) as total_debits,
      COALESCE(SUM(jl.credit_amount), 0) as total_credits
    FROM chart_of_accounts ca
    JOIN journal_lines jl ON ca.id = jl.account_id
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    WHERE ca.company_id = ? AND ca.is_active = 1
      AND je.company_id = ?
      AND je.status = 'posted'
      AND je.period_id = ?
      AND ca.tax_category IS NOT NULL
      AND ca.account_type IN ('revenue', 'expense')
    GROUP BY ca.tax_category
    ORDER BY ca.tax_category ASC
  `;

  const rows = rawDb.query(query).all(companyId, companyId, periodId) as any[];

  const taxes: TaxLine[] = [];
  
  for (const row of rows) {
    const debits = Math.round(row.total_debits * 100);
    const credits = Math.round(row.total_credits * 100);
    // Note: Net calculation logic per Tax category. Usually represented as absolute numbers in IRS forms based on normal balance.
    // For simplicity: Net = debits - credits
    let balance = (debits - credits) / 100;
    
    taxes.push({
      taxCategory: row.tax_category,
      totalBalance: balance, // Positive means Net Debit (Expense dominant), Negative means Net Credit (Revenue dominant)
    });
  }

  // 3. Cryptographic validations
  const forensicCheck = verifyAuditChain();
  
  if (!forensicCheck.valid) {
    throw new AccountingError(`CRITICAL AUDIT FAILURE: Chain tampered at index ${forensicCheck.brokenAtIndex}. Extract unsafe.`);
  }
  
  // Extract the most recent SHA-256 hash for this period
  const lastHashRow = rawDb.query(
    `SELECT entry_hash FROM audit_logs 
     WHERE company_id = ? AND created_at <= ?
     ORDER BY chain_index DESC LIMIT 1`
  ).get(companyId, period.end_date) as { entry_hash: string } | null;

  const disclaimer = "LEGAL DISCLAIMER: Este reporte no constituye asesoramiento tributario, financiero o legal ni una declaración de impuestos oficial. Consulte a su CPA o asesor contable colegiado antes de presentar cualquier documentación al Internal Revenue Service (IRS). La integridad de estos datos se valida computacionalmente mediante esquemas inmutables basados en SHA-256 asumiendo el Cierre Contable correspondiente.";

  return {
    companyId,
    periodId,
    disclaimer,
    hashTimestamp: new Date().toISOString(),
    sha256ChainResult: lastHashRow?.entry_hash ?? "HASH_CHAIN_EMPTY",
    rfc3161_token_hex: null, // Optional RFC 3161 Token
    taxes,
  };
}

