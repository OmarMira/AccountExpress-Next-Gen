// ============================================================
// MIGRATION RUNNER
// Applies 14 ordered migrations in strict FK-dependency order.
// Tracks applied migrations in _migrations table to be idempotent.
// After migrations: applies indexes and SQLite triggers.
// ============================================================

import { rawDb } from "./connection.ts";
import { INDEXES } from "./indexes.ts";
import { TRIGGERS } from "./triggers.ts";

// Ensure migration tracking table exists
rawDb.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )
`);

interface Migration {
  name: string;
  up: () => void;
}

// ── MIGRATION DEFINITIONS ────────────────────────────────────
// Ordered by FK dependency — MUST NOT reorder.

const migrations: Migration[] = [
  // 001 — system_config
  {
    name: "001_system_config",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS system_config (
        id            TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        app_name      TEXT NOT NULL,
        license_key   TEXT,
        max_companies INTEGER NOT NULL DEFAULT 999,
        maintenance_mode INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      )
    `),
  },

  // 002 — companies
  {
    name: "002_companies",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id               TEXT PRIMARY KEY,
        legal_name       TEXT NOT NULL,
        trade_name       TEXT,
        ein              TEXT UNIQUE,
        address          TEXT,
        city             TEXT,
        state            TEXT,
        zip_code         TEXT,
        phone            TEXT,
        email            TEXT,
        fiscal_year_start TEXT NOT NULL,
        currency         TEXT NOT NULL DEFAULT 'USD',
        is_active        INTEGER NOT NULL DEFAULT 1,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      )
    `),
  },

  // 003 — users
  {
    name: "003_users",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id                   TEXT PRIMARY KEY,
        username             TEXT NOT NULL UNIQUE,
        email                TEXT NOT NULL UNIQUE,
        password_hash        TEXT NOT NULL,
        password_salt        TEXT NOT NULL,
        first_name           TEXT NOT NULL,
        last_name            TEXT NOT NULL,
        is_super_admin       INTEGER NOT NULL DEFAULT 0,
        is_active            INTEGER NOT NULL DEFAULT 1,
        is_locked            INTEGER NOT NULL DEFAULT 0,
        failed_attempts      INTEGER NOT NULL DEFAULT 0,
        locked_until         TEXT,
        last_login_at        TEXT,
        last_login_ip        TEXT,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL
      )
    `),
  },

  // 004 — roles
  {
    name: "004_roles",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description  TEXT,
        is_system    INTEGER NOT NULL DEFAULT 0,
        is_active    INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL
      )
    `),
  },

  // 005 — permissions
  {
    name: "005_permissions",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS permissions (
        id          TEXT PRIMARY KEY,
        module      TEXT NOT NULL,
        action      TEXT NOT NULL,
        description TEXT,
        created_at  TEXT NOT NULL,
        UNIQUE(module, action)
      )
    `),
  },

  // 006 — role_permissions (depends: roles, permissions)
  {
    name: "006_role_permissions",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id            TEXT PRIMARY KEY,
        role_id       TEXT NOT NULL REFERENCES roles(id),
        permission_id TEXT NOT NULL REFERENCES permissions(id),
        created_at    TEXT NOT NULL
      )
    `),
  },

  // 007 — user_company_roles (depends: users, companies, roles)
  {
    name: "007_user_company_roles",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS user_company_roles (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id),
        company_id  TEXT NOT NULL REFERENCES companies(id),
        role_id     TEXT NOT NULL REFERENCES roles(id),
        is_active   INTEGER NOT NULL DEFAULT 1,
        granted_by  TEXT NOT NULL REFERENCES users(id),
        granted_at  TEXT NOT NULL,
        revoked_at  TEXT,
        UNIQUE(user_id, company_id)
      )
    `),
  },

  // 008 — sessions (depends: users, companies)
  {
    name: "008_sessions",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id             TEXT PRIMARY KEY,
        user_id        TEXT NOT NULL REFERENCES users(id),
        company_id     TEXT REFERENCES companies(id),
        ip_address     TEXT NOT NULL,
        user_agent     TEXT,
        created_at     TEXT NOT NULL,
        expires_at     TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        is_valid       INTEGER NOT NULL DEFAULT 1
      )
    `),
  },

  // 009 — fiscal_periods (depends: companies, users)
  {
    name: "009_fiscal_periods",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS fiscal_periods (
        id          TEXT PRIMARY KEY,
        company_id  TEXT NOT NULL REFERENCES companies(id),
        name        TEXT NOT NULL,
        period_type TEXT NOT NULL,
        start_date  TEXT NOT NULL,
        end_date    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open',
        closed_by   TEXT REFERENCES users(id),
        closed_at   TEXT,
        created_at  TEXT NOT NULL
      )
    `),
  },

  // 010 — audit_logs (depends: companies, users, sessions)
  {
    name: "010_audit_logs",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id              TEXT PRIMARY KEY,
        company_id      TEXT REFERENCES companies(id),
        user_id         TEXT REFERENCES users(id),
        session_id      TEXT REFERENCES sessions(id),
        action          TEXT NOT NULL,
        module          TEXT NOT NULL,
        entity_type     TEXT,
        entity_id       TEXT,
        before_state    TEXT,
        after_state     TEXT,
        ip_address      TEXT NOT NULL,
        entry_hash      TEXT NOT NULL,
        prev_hash       TEXT NOT NULL,
        chain_index     INTEGER NOT NULL,
        timestamp_token TEXT,
        created_at      TEXT NOT NULL
      )
    `),
  },

  // 011 — chart_of_accounts (depends: companies)
  {
    name: "011_chart_of_accounts",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id             TEXT PRIMARY KEY,
        company_id     TEXT NOT NULL REFERENCES companies(id),
        code           TEXT NOT NULL,
        name           TEXT NOT NULL,
        account_type   TEXT NOT NULL,
        normal_balance TEXT NOT NULL,
        parent_id      TEXT,
        level          INTEGER NOT NULL DEFAULT 1,
        is_system      INTEGER NOT NULL DEFAULT 0,
        is_active      INTEGER NOT NULL DEFAULT 1,
        tax_category   TEXT,
        description    TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        UNIQUE(company_id, code)
      )
    `),
  },

  // 012 — journal_entries (depends: companies, fiscal_periods, users)
  {
    name: "012_journal_entries",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id           TEXT PRIMARY KEY,
        company_id   TEXT NOT NULL REFERENCES companies(id),
        entry_number TEXT NOT NULL,
        entry_date   TEXT NOT NULL,
        description  TEXT NOT NULL,
        reference    TEXT,
        status       TEXT NOT NULL DEFAULT 'draft',
        is_adjusting INTEGER NOT NULL DEFAULT 0,
        is_reversing INTEGER NOT NULL DEFAULT 0,
        reverses_id  TEXT,
        period_id    TEXT NOT NULL REFERENCES fiscal_periods(id),
        created_by   TEXT NOT NULL REFERENCES users(id),
        posted_by    TEXT REFERENCES users(id),
        posted_at    TEXT,
        entry_hash   TEXT NOT NULL,
        prev_hash    TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        UNIQUE(company_id, entry_number)
      )
    `),
  },

  // 013 — journal_lines (depends: journal_entries, chart_of_accounts, companies)
  {
    name: "013_journal_lines",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS journal_lines (
        id               TEXT PRIMARY KEY,
        journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id),
        company_id       TEXT NOT NULL REFERENCES companies(id),
        account_id       TEXT NOT NULL REFERENCES chart_of_accounts(id),
        debit_amount     REAL NOT NULL DEFAULT 0,
        credit_amount    REAL NOT NULL DEFAULT 0,
        description      TEXT,
        line_number      INTEGER NOT NULL,
        created_at       TEXT NOT NULL,
        CHECK (debit_amount >= 0),
        CHECK (credit_amount >= 0),
        CHECK (debit_amount > 0 OR credit_amount > 0),
        CHECK (NOT (debit_amount > 0 AND credit_amount > 0))
      )
    `),
  },

  // 014 — bank_transactions (depends: companies, journal_entries, users)
  {
    name: "014_bank_transactions",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS bank_transactions (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(id),
        bank_account     TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        description      TEXT NOT NULL,
        amount           REAL NOT NULL,
        transaction_type TEXT NOT NULL,
        reference_number TEXT,
        status           TEXT NOT NULL DEFAULT 'pending',
        journal_entry_id TEXT REFERENCES journal_entries(id),
        matched_by       TEXT REFERENCES users(id),
        matched_at       TEXT,
        import_batch_id  TEXT,
        created_at       TEXT NOT NULL
      )
    `),
  },

  // 015 — system_config_backup (depends: system_config)
  {
    name: "015_system_config_backup",
    up: () => rawDb.exec(`
      ALTER TABLE system_config ADD COLUMN backup_schedule_hour INTEGER
    `),
  },

  // 016 — bank_accounts (depends: companies, chart_of_accounts)
  {
    name: "016_bank_accounts",
    up: () => rawDb.exec(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id             TEXT PRIMARY KEY,
        company_id     TEXT NOT NULL REFERENCES companies(id),
        account_name   TEXT NOT NULL,
        bank_name      TEXT NOT NULL,
        account_number TEXT,
        account_type   TEXT NOT NULL DEFAULT 'checking',
        gl_account_id  TEXT REFERENCES chart_of_accounts(id),
        is_active      INTEGER NOT NULL DEFAULT 1,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      )
    `),
  },
];

// ── RUNNER ───────────────────────────────────────────────────

function getAppliedMigrations(): Set<string> {
  const rows = rawDb
    .query("SELECT name FROM _migrations")
    .all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

function recordMigration(name: string): void {
  rawDb
    .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
    .run(name, new Date().toISOString());
}

export function runMigrations(): void {
  console.log("[MIGRATE] Starting migration runner...");
  const applied = getAppliedMigrations();
  let count = 0;

  for (const m of migrations) {
    if (applied.has(m.name)) {
      console.log(`[MIGRATE] ✓ Already applied: ${m.name}`);
      continue;
    }
    console.log(`[MIGRATE] ⟶  Applying: ${m.name}`);
    m.up();
    recordMigration(m.name);
    count++;
  }

  // Apply indexes (IF NOT EXISTS — idempotent)
  console.log("[MIGRATE] Applying indexes...");
  for (const idx of INDEXES) {
    rawDb.exec(idx);
  }

  // Apply triggers (IF NOT EXISTS — idempotent)
  console.log("[MIGRATE] Applying triggers...");
  for (const trg of TRIGGERS) {
    rawDb.exec(trg);
  }

  console.log(
    `[MIGRATE] Done. ${count} new migration(s) applied. Indexes and triggers registered.`
  );
}

// ── DIRECT RUN ───────────────────────────────────────────────
// Allow: bun run src/db/migrate.ts
if (import.meta.main) {
  runMigrations();
  process.exit(0);
}

