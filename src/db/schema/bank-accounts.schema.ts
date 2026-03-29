// ============================================================
// BANK ACCOUNTS SCHEMA — PostgreSQL 16
// ============================================================

import { pgTable, text, boolean, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./system.schema.ts";
import { chartOfAccounts } from "./accounting.schema.ts";

export const bankAccounts = pgTable("bank_accounts", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id),
  accountName: text("account_name").notNull(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number"),
  accountType: text("account_type").notNull().default("checking"),
  // balance stored as integer cents to avoid floating point issues
  balance: integer("balance").notNull().default(0),
  glAccountId: text("gl_account_id").references(() => chartOfAccounts.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
