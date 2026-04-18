// ============================================================
// BANK RULES SCHEMA — PostgreSQL 16
// Deterministic rule engine for automatic transaction
// categorization at import time. Mirrors QuickBooks Bank Rules.
// ============================================================

import { pgTable, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./system.schema.ts";
import { chartOfAccounts } from "./accounting.schema.ts";

export const bankRules = pgTable("bank_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  name: text("name").notNull(),
  // Condition applied to transaction description (case-insensitive)
  conditionType: text("condition_type")
    .notNull()
    .$type<"contains" | "starts_with" | "equals">(),
  conditionValue: text("condition_value").notNull(),
  // Filter by transaction direction; 'any' matches both
  transactionDirection: text("transaction_direction")
    .notNull()
    .$type<"debit" | "credit" | "any">()
    .default("any"),
  glAccountId: text("gl_account_id")
    .notNull()
    .references(() => chartOfAccounts.id),
  // autoAdd=false → pre-fills GL account, user must confirm
  // autoAdd=true  → auto-match engine reconciles automatically
  autoAdd: boolean("auto_add").notNull().default(false),
  // Lower number = higher priority when multiple rules match
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idxRulesCompany: index("idx_bank_rules_company").on(table.companyId, table.isActive),
}));
