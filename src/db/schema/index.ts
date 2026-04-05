// ============================================================
// SCHEMA INDEX
// Re-exports all table definitions for Drizzle Kit and app use.
// Import from here — never import directly from individual schema files
// (except within services that need a single schema for dependency clarity).
// ============================================================

// Group A — System Infrastructure
export {
  systemConfig,
  companies,
  users,
  roles,
  permissions,
  rolePermissions,
  userCompanyRoles,
  sessions,
  auditLogs,
  fiscalPeriods,
} from "./system.schema.ts";

// Group B — Accounting Core
export {
  chartOfAccounts,
  journalEntries,
  journalLines,
  bankTransactions,
} from "./accounting.schema.ts";
export {
  bankAccounts,
  bankTransactionGroups,
  bankTransactionGroupItems,
} from "./bank-accounts.schema.ts";

