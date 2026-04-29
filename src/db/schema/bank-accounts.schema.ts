// ============================================================
// BANK ACCOUNTS SCHEMA — PostgreSQL 16
// ============================================================

import { pgTable, text, boolean, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./system.schema.ts";
import { chartOfAccounts, journalEntries, bankTransactions } from "./accounting.schema.ts";

export const bankAccounts = pgTable("bank_accounts", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id),
  accountName: text("account_name").notNull(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number"),
  accountType: text("account_type").notNull().default("checking"),
  // balance: Current recalculated balance (stored as integer cents).
  // STRATEGY: Option A — Service-based recalculation.
  // The balance is NOT updated via database triggers or views.
  // Instead, it is recalculated by a dedicated service (reconciliation.service.ts)
  // after discrete events: imports, reconciliation, or unreconciliation.
  // Formula: initial_balance + SUM(reconciled bank_transactions).
  balance: integer("balance").notNull().default(0),
  // initialBalance: the "Beginning balance" from the EARLIEST imported statement
  // Stored in integer cents (same convention as balance).
  // initialBalancePeriodStart: ISO date (YYYY-MM-DD) of that earliest statement period.
  initialBalance: integer("initial_balance").notNull().default(0),
  initialBalancePeriodStart: text("initial_balance_period_start"),
  glAccountId: text("gl_account_id").references(() => chartOfAccounts.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const bankTransactionGroups = pgTable("bank_transaction_groups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  description: text("description").notNull(),
  totalAmount: integer("total_amount").notNull(), // in cents
  glAccountId: text("gl_account_id")
    .notNull()
    .references(() => chartOfAccounts.id),
  journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
  status: text("status")
    .notNull()
    .default("pending")
    .$type<"pending" | "reconciled">(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
});

export const bankTransactionGroupItems = pgTable("bank_transaction_group_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id")
    .notNull()
    .references(() => bankTransactionGroups.id),
  transactionId: text("transaction_id")
    .notNull()
    .references(() => bankTransactions.id),
});
