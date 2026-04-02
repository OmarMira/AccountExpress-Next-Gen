-- Create the application database user
-- IMPORTANT: Replace YOUR_SECURE_PASSWORD_HERE with a strong password.
-- Store the real password in your .env file as DATABASE_URL, never in this file.
CREATE USER accountexpress_app WITH PASSWORD 'YOUR_SECURE_PASSWORD_HERE';

GRANT CONNECT ON DATABASE accountexpress TO accountexpress_app;
GRANT USAGE ON SCHEMA public TO accountexpress_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO accountexpress_app;

-- ── Tables that allow full CRUD ───────────────────────────────
-- These tables support normal create/update/delete operations
GRANT SELECT, INSERT, UPDATE, DELETE ON
  companies,
  users,
  roles,
  permissions,
  role_permissions,
  user_company_roles,
  sessions,
  fiscal_periods,
  system_config,
  bank_accounts
TO accountexpress_app;

-- ── Append-only tables (no UPDATE, no DELETE) ─────────────────
-- audit_logs: cryptographic chain — immutable by design
-- journal_entries: accounting ledger — corrections via reversal entries only
-- journal_lines: detail lines of journal entries — same immutability
-- bank_transactions: imported bank data — status changes only via UPDATE
GRANT SELECT, INSERT ON
  audit_logs,
  journal_entries,
  journal_lines
TO accountexpress_app;

-- bank_transactions needs UPDATE for status changes (pending -> reconciled)
-- but never DELETE
GRANT SELECT, INSERT, UPDATE ON
  bank_transactions
TO accountexpress_app;

-- chart_of_accounts needs UPDATE (activate/deactivate accounts) but not DELETE
GRANT SELECT, INSERT, UPDATE ON
  chart_of_accounts
TO accountexpress_app;
