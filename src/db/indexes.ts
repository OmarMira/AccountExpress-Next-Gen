// ============================================================
// DATABASE INDEXES
// All 8 mandatory performance indexes for multi-tenant queries.
// Applied once after migrations run.
// ============================================================

export const INDEXES: string[] = [
  // ── Multi-tenant isolation (CRITICAL — largest table scans) ──────────
  `CREATE INDEX IF NOT EXISTS idx_journal_entries_company_date
     ON journal_entries(company_id, entry_date)`,

  `CREATE INDEX IF NOT EXISTS idx_journal_lines_company
     ON journal_lines(company_id, account_id)`,

  `CREATE INDEX IF NOT EXISTS idx_bank_transactions_company_status
     ON bank_transactions(company_id, status)`,

  `CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company_code
     ON chart_of_accounts(company_id, code)`,

  // ── Security & session lookups ────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_valid
     ON sessions(user_id, is_valid)`,

  `CREATE INDEX IF NOT EXISTS idx_user_company_roles_active
     ON user_company_roles(user_id, company_id, is_active)`,

  // ── Forensic audit search ─────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_company_action
     ON audit_logs(company_id, action, created_at)`,

  `CREATE INDEX IF NOT EXISTS idx_audit_logs_chain
     ON audit_logs(chain_index)`,

  // ── pg_trgm fuzzy matching (smart-match engine) ───────────────────────
  `CREATE INDEX IF NOT EXISTS idx_bank_tx_description_trgm
     ON bank_transactions USING gin(description gin_trgm_ops)`,

  `CREATE INDEX IF NOT EXISTS idx_coa_name_trgm
     ON chart_of_accounts USING gin(name gin_trgm_ops)`,

  // ── Schema evolution (idempotent column additions) ────────────────────
  `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS initial_balance INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS initial_balance_period_start TEXT`,
];

