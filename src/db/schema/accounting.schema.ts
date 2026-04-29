// ============================================================
// ACCOUNTING CORE SCHEMA — PostgreSQL 16
// Group B — 4 tables: US GAAP double-entry bookkeeping engine
// Depends entirely on Group A (system.schema.ts).
// ============================================================

import {
  pgTable,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  check,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  companies,
  users,
  fiscalPeriods,
} from "./system.schema.ts";

// ─────────────────────────────────────────────────────────────
// 11. CHART_OF_ACCOUNTS
// US GAAP standard plan, codes 1000–5999.
// Hierarchical (parent_id self-reference for sub-accounts).
// is_system=true accounts cannot be deleted.
// ─────────────────────────────────────────────────────────────
export const chartOfAccounts = pgTable("chart_of_accounts", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  code: text("code").notNull(),    // e.g. "1010", "4000"
  name: text("name").notNull(),
  accountType: text("account_type").notNull(),  // asset|liability|equity|revenue|expense
  normalBalance: text("normal_balance").notNull(), // debit|credit
  parentId: text("parent_id"),    // self-referencing FK (null = root account)
  level: integer("level").default(1).notNull(), // 1=root, 2=sub, 3=sub-sub…
  isSystem: boolean("is_system").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  taxCategory: text("tax_category"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// ─────────────────────────────────────────────────────────────
// 12. JOURNAL_ENTRIES
// Header of each accounting entry.
// ─────────────────────────────────────────────────────────────
export const journalEntries = pgTable("journal_entries", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  entryNumber: text("entry_number").notNull(), // "JE-2026-0001" per company
  entryDate: text("entry_date").notNull(),     // accounting date YYYY-MM-DD
  description: text("description").notNull(),
  reference: text("reference"),
  status: text("status").default("draft").notNull(), // draft|posted|voided
  isAdjusting: boolean("is_adjusting").default(false).notNull(),
  isReversing: boolean("is_reversing").default(false).notNull(),
  reversesId: text("reverses_id"),
  periodId: text("period_id")
    .notNull()
    .references(() => fiscalPeriods.id),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  postedBy: text("posted_by")
    .references(() => users.id),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  entryHash: text("entry_hash").notNull(),
  prevHash: text("prev_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => ({
  idxJeCompanyDate: index("idx_je_company_date").on(table.companyId, table.entryDate),
  idxJeStatus: index("idx_je_status").on(table.status),
}));

// ─────────────────────────────────────────────────────────────
// 13. JOURNAL_LINES
// Individual lines of each journal entry.
// CRITICAL: debit_amount and credit_amount use numeric(15,2)
//   — NOT real/float — to avoid floating-point rounding errors
//   in financial calculations.
// CHECK constraints enforce double-entry rules at DB level.
// ─────────────────────────────────────────────────────────────
export const journalLines = pgTable(
  "journal_lines",
  {
    id: text("id").primaryKey(),
    journalEntryId: text("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    accountId: text("account_id")
      .notNull()
      .references(() => chartOfAccounts.id),
    debitAmount: numeric("debit_amount", { precision: 15, scale: 2 }).default("0").notNull(),
    creditAmount: numeric("credit_amount", { precision: 15, scale: 2 }).default("0").notNull(),
    description: text("description"),
    lineNumber: integer("line_number").notNull(),
    isReconciled: boolean("is_reconciled").default(false).notNull(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    checkDebitNonNegative: check(
      "chk_debit_non_negative",
      sql`${table.debitAmount} >= 0`
    ),
    checkCreditNonNegative: check(
      "chk_credit_non_negative",
      sql`${table.creditAmount} >= 0`
    ),
    checkAtLeastOne: check(
      "chk_at_least_one_amount",
      sql`${table.debitAmount} > 0 OR ${table.creditAmount} > 0`
    ),
    checkNotBoth: check(
      "chk_not_both_amounts",
      sql`NOT (${table.debitAmount} > 0 AND ${table.creditAmount} > 0)`
    ),
  })
);

// ─────────────────────────────────────────────────────────────
// 14. BANK_TRANSACTIONS
// Bank movements imported (CSV) or captured manually.
// amount uses numeric(15,2) — NOT real/float.
// ─────────────────────────────────────────────────────────────
export const bankTransactions = pgTable("bank_transactions", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  bankAccount: text("bank_account").notNull(),
  transactionDate: text("transaction_date").notNull(), // YYYY-MM-DD
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  transactionType: text("transaction_type").notNull(), // debit|credit
  referenceNumber: text("reference_number"),
  status: text("status").default("pending").notNull(), // pending|matched|reconciled|ignored|assigned
  glAccountId: text("gl_account_id").references(() => chartOfAccounts.id),
  journalEntryId: text("journal_entry_id")
    .references(() => journalEntries.id),
  matchedBy: text("matched_by")
    .references(() => users.id),
  matchedAt: timestamp("matched_at", { withTimezone: true }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  importBatchId: text("import_batch_id"),
  appliedRuleId: text("applied_rule_id"),
  matchSource: text("match_source"), // 'auto_matched' | 'manual' | 'new_entry'
  reconciliationSplits: jsonb("reconciliation_splits"), // [{ glAccountId: string, amount: number }]
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => ({
  idxBtCompanyStatus: index("idx_bt_company_status").on(table.companyId, table.status),
  idxBtDate: index("idx_bt_date").on(table.transactionDate),
}));
