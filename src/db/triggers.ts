// ============================================================
// POSTGRESQL TRIGGERS — PL/pgSQL
// Last line of defense — enforced at DB level regardless of ORM.
// Applied after migrations run via migrate.ts.
//
// Each trigger follows the PostgreSQL pattern:
//   1. CREATE OR REPLACE FUNCTION fn_*() RETURNS TRIGGER
//   2. CREATE TRIGGER trg_* ... EXECUTE FUNCTION fn_*()
//
// All 5 triggers maintain the same business logic as the
// original SQLite triggers — only the syntax changes.
// ============================================================

export const TRIGGERS: string[] = [
  // ── TRIGGER 1: audit_logs IMMUTABILITY ───────────────────────────────
  // No UPDATE allowed on any audit_logs row — ever.
  `
  CREATE OR REPLACE FUNCTION fn_audit_immutable()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'audit_logs is immutable — UPDATE not allowed';
  END;
  $$
  `,
  `
  DROP TRIGGER IF EXISTS trg_audit_immutable ON audit_logs;
  CREATE TRIGGER trg_audit_immutable
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_immutable()
  `,

  // ── TRIGGER 2: audit_logs NO DELETE ──────────────────────────────────
  // No DELETE allowed on any audit_logs row — ever.
  `
  CREATE OR REPLACE FUNCTION fn_audit_nodelete()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'audit_logs is immutable — DELETE not allowed';
  END;
  $$
  `,
  `
  DROP TRIGGER IF EXISTS trg_audit_nodelete ON audit_logs;
  CREATE TRIGGER trg_audit_nodelete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_nodelete()
  `,

  // ── TRIGGER 3: PROTECT CLOSED / LOCKED FISCAL PERIODS ────────────────
  // Any attempt to INSERT a journal_entry into a non-open period is aborted.
  // Subquery moved inside the function body (PostgreSQL does not allow
  // subqueries in the WHEN clause of a trigger).
  `
  CREATE OR REPLACE FUNCTION fn_protect_closed_period()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  DECLARE
    period_status TEXT;
  BEGIN
    SELECT status INTO period_status
      FROM fiscal_periods
     WHERE id = NEW.period_id;

    IF period_status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'Cannot insert into a closed or locked fiscal period';
    END IF;

    RETURN NEW;
  END;
  $$
  `,
  `
  DROP TRIGGER IF EXISTS trg_protect_closed_period ON journal_entries;
  CREATE TRIGGER trg_protect_closed_period
    BEFORE INSERT ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_closed_period()
  `,

  // ── TRIGGER 4: PREVENT MODIFYING POSTED JOURNAL ENTRIES ──────────────
  // A posted journal_entry is truly final — only voiding is allowed.
  `
  CREATE OR REPLACE FUNCTION fn_protect_posted_entry()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.status = 'posted' AND NEW.status <> 'voided' THEN
      RAISE EXCEPTION 'Cannot modify a posted journal entry — create a reversing entry instead';
    END IF;
    RETURN NEW;
  END;
  $$
  `,
  `
  DROP TRIGGER IF EXISTS trg_protect_posted_entry ON journal_entries;
  CREATE TRIGGER trg_protect_posted_entry
    BEFORE UPDATE ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_posted_entry()
  `,

  // ── TRIGGER 5: VERIFY VOIDED ENTRIES HAVE REVERSES_ID ─────────────
  // A journal_entry can only be changed to 'voided' if it has a reverses_id.
  `
  CREATE OR REPLACE FUNCTION fn_verify_void_reverses()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.status = 'voided' AND NEW.reverses_id IS NULL THEN
      RAISE EXCEPTION 'Cannot void a journal entry without a reverses_id';
    END IF;
    RETURN NEW;
  END;
  $$
  `,
  `
  DROP TRIGGER IF EXISTS trg_verify_void_reverses ON journal_entries;
  CREATE TRIGGER trg_verify_void_reverses
    BEFORE UPDATE ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION fn_verify_void_reverses()
  `,
];
