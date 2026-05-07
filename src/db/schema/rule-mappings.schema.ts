// ============================================================
// RULE MAPPINGS SCHEMA — Deterministic Fallback for AI
// ============================================================

import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./system.schema.ts";
import { chartOfAccounts } from "./accounting.schema.ts";

export const ruleMappings = pgTable("rule_mappings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pattern: text("pattern").notNull(), // e.g. 'LYFT', 'LAURA QUIJANO'
  glAccountCode: text("gl_account_code").notNull(), // US GAAP Code e.g. '5210'
  companyId: text("company_id").references(() => companies.id), // null if global
  isGlobal: boolean("is_global").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idxMappingPattern: index("idx_rule_mappings_pattern").on(table.pattern),
  idxMappingCompany: index("idx_rule_mappings_company").on(table.companyId, table.isGlobal),
}));
