// ============================================================
// ACCOUNTING CORE SCHEMA
// Group B — 4 tables: US GAAP double-entry bookkeeping engine
// Depends entirely on Group A (system.schema.ts).
// RULE: No file > 500 lines. One file = one responsibility group.
// ============================================================

import {
  sqliteTable,
  text,
  integer,
  real,
  check,
} from "drizzle-orm/sqlite-core";
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
// is_system=1 accounts cannot be deleted.
// ─────────────────────────────────────────────────────────────
export const chartOfAccounts = sqliteTable("chart_of_accounts", {
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
  isSystem: integer("is_system").default(0).notNull(), // 1 = seeded, cannot be deleted
  isActive: integer("is_active").default(1).notNull(),
  taxCategory: text("tax_category"),  // e.g. "Schedule C - Advertising"
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─────────────────────────────────────────────────────────────
// 12. JOURNAL_ENTRIES
// Header of each accounting entry.
// N lines (journal_lines) per entry.
// INVARIANT: SUM(debits) == SUM(credits) — enforced by JournalService.post()
//            before any INSERT. Cannot be bypassed.
// SHA-256 chain links entries in chronological order.
// ─────────────────────────────────────────────────────────────
export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  entryNumber: text("entry_number").notNull(), // "JE-2026-0001" per company
  entryDate: text("entry_date").notNull(),     // accounting date ISO 8601
  description: text("description").notNull(),
  reference: text("reference"),               // external reference (check#, invoice#)
  status: text("status").default("draft").notNull(), // draft|posted|voided
  isAdjusting: integer("is_adjusting").default(0).notNull(), // closing adjustment flag
  isReversing: integer("is_reversing").default(0).notNull(), // reversal entry flag
  reversesId: text("reverses_id"),            // FK to original entry being reversed
  periodId: text("period_id")
    .notNull()
    .references(() => fiscalPeriods.id),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  postedBy: text("posted_by")
    .references(() => users.id), // null until posted
  postedAt: text("posted_at"),   // ISO 8601 UTC — null until posted
  entryHash: text("entry_hash").notNull(), // SHA-256(header + all lines)
  prevHash: text("prev_hash").notNull(),   // SHA-256 of prior journal entry (chain)
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─────────────────────────────────────────────────────────────
// 13. JOURNAL_LINES
// Individual lines of each journal entry.
// Each line affects exactly ONE account.
// CHECK constraints enforce:
//   - debit_amount >= 0
//   - credit_amount >= 0
//   - at least one > 0
//   - NOT both > 0 (a line cannot be simultaneously debit and credit)
// ─────────────────────────────────────────────────────────────
export const journalLines = sqliteTable(
  "journal_lines",
  {
    id: text("id").primaryKey(),
    journalEntryId: text("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id), // denormalized for query performance
    accountId: text("account_id")
      .notNull()
      .references(() => chartOfAccounts.id),
    debitAmount: real("debit_amount").default(0).notNull(),
    creditAmount: real("credit_amount").default(0).notNull(),
    description: text("description"),
    lineNumber: integer("line_number").notNull(), // order within entry
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    // Enforce double-entry line rules at DB level
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
// Reconciliation connects each bank transaction to a journal_entry.
// Without a verifiable bank transaction, it doesn't exist in the books.
// All transactions must be "reconciled" or "ignored" before period close.
// ─────────────────────────────────────────────────────────────
export const bankTransactions = sqliteTable("bank_transactions", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  bankAccount: text("bank_account").notNull(), // account name or masked number
  transactionDate: text("transaction_date").notNull(), // bank-reported date
  description: text("description").notNull(),
  amount: real("amount").notNull(),            // positive=income, negative=expense
  transactionType: text("transaction_type").notNull(), // debit|credit
  referenceNumber: text("reference_number"),   // bank reference / check number
  status: text("status").default("pending").notNull(), // pending|matched|reconciled|ignored
  journalEntryId: text("journal_entry_id")
    .references(() => journalEntries.id), // null until reconciled
  matchedBy: text("matched_by")
    .references(() => users.id),          // user who performed reconciliation
  matchedAt: text("matched_at"),          // ISO 8601 UTC
  importBatchId: text("import_batch_id"), // UUID of the CSV import batch
  createdAt: text("created_at").notNull(),
});
