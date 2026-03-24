// ============================================================
// SQLITE TRIGGERS
// Last line of defense — enforced at DB level regardless of ORM.
// Applied once after migrations run.
// ============================================================

export const TRIGGERS: string[] = [
  // ── TRIGGER 1: audit_logs IMMUTABILITY ───────────────────────────────
  // No UPDATE allowed on any audit_logs row — ever.
  `CREATE TRIGGER IF NOT EXISTS trg_audit_immutable
   BEFORE UPDATE ON audit_logs
   BEGIN
     SELECT RAISE(ABORT, 'audit_logs is immutable — UPDATE not allowed');
   END`,

  // ── TRIGGER 2: audit_logs NO DELETE ──────────────────────────────────
  // No DELETE allowed on any audit_logs row — ever.
  `CREATE TRIGGER IF NOT EXISTS trg_audit_nodelete
   BEFORE DELETE ON audit_logs
   BEGIN
     SELECT RAISE(ABORT, 'audit_logs is immutable — DELETE not allowed');
   END`,

  // ── TRIGGER 3: PROTECT CLOSED / LOCKED FISCAL PERIODS ────────────────
  // Any attempt to insert a journal_entry into a non-open period is aborted.
  // This fires BEFORE the journal service level check as a final safeguard.
  `CREATE TRIGGER IF NOT EXISTS trg_protect_closed_period
   BEFORE INSERT ON journal_entries
   WHEN (
     SELECT status FROM fiscal_periods WHERE id = NEW.period_id
   ) != 'open'
   BEGIN
     SELECT RAISE(ABORT, 'Cannot insert into a closed or locked fiscal period');
   END`,

  // ── TRIGGER 4: PREVENT MODIFYING POSTED JOURNAL ENTRIES ──────────────
  // A posted journal_entry is truly final — only voiding is allowed via
  // a separate service-level operation that creates a new reversing entry.
  `CREATE TRIGGER IF NOT EXISTS trg_protect_posted_entry
   BEFORE UPDATE ON journal_entries
   WHEN OLD.status = 'posted' AND NEW.status != 'voided'
   BEGIN
     SELECT RAISE(ABORT, 'Cannot modify a posted journal entry — create a reversing entry instead');
   END`,
];

