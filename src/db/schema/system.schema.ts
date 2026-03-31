// ============================================================
// SYSTEM INFRASTRUCTURE SCHEMA — PostgreSQL 16
// Group A — 10 tables: security, multitenancy, audit
// ============================================================

import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// 1. SYSTEM_CONFIG
// Single-row global installation configuration.
// ─────────────────────────────────────────────────────────────
export const systemConfig = pgTable("system_config", {
  id: text("id").primaryKey(), // UUID v4
  schemaVersion: text("schema_version").notNull(),
  appName: text("app_name").notNull(),
  licenseKey: text("license_key"),
  maxCompanies: integer("max_companies").default(999).notNull(),
  maintenanceMode: boolean("maintenance_mode").default(false).notNull(),
  backupScheduleHour: integer("backup_schedule_hour"), // nullable
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// ─────────────────────────────────────────────────────────────
// 2. COMPANIES
// Each row = fully isolated tenant.
// ─────────────────────────────────────────────────────────────
export const companies = pgTable("companies", {
  id: text("id").primaryKey(),
  legalName: text("legal_name").notNull(),
  tradeName: text("trade_name"),
  ein: text("ein").unique(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  phone: text("phone"),
  email: text("email"),
  fiscalYearStart: text("fiscal_year_start").notNull(), // MM-DD e.g. "01-01"
  currency: text("currency").default("USD").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// ─────────────────────────────────────────────────────────────
// 3. USERS
// Passwords NEVER stored in plain text.
// bcrypt cost 12 = ~300ms per hash (brute-force deterrent).
// After 5 failed consecutive attempts → locked for 30 min.
// ─────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // bcrypt hash, cost 12
  passwordSalt: text("password_salt").notNull(), // random salt per user
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  isSuperAdmin: boolean("is_super_admin").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isLocked: boolean("is_locked").default(false).notNull(),
  failedAttempts: integer("failed_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: text("last_login_ip"),
  mustChangePassword: boolean("must_change_password").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// ─────────────────────────────────────────────────────────────
// 4. ROLES
// 4 system roles (is_system=true) cannot be deleted.
// ─────────────────────────────────────────────────────────────
export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),         // e.g. "super_admin"
  displayName: text("display_name").notNull(),   // e.g. "Super Administrador"
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// ─────────────────────────────────────────────────────────────
// 5. PERMISSIONS
// Granular module:action pairs.
// ─────────────────────────────────────────────────────────────
export const permissions = pgTable(
  "permissions",
  {
    id: text("id").primaryKey(),
    module: text("module").notNull(),
    action: text("action").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    moduleActionUnique: uniqueIndex("uq_permissions_module_action").on(
      table.module,
      table.action
    ),
  })
);

// ─────────────────────────────────────────────────────────────
// 6. ROLE_PERMISSIONS
// ─────────────────────────────────────────────────────────────
export const rolePermissions = pgTable("role_permissions", {
  id: text("id").primaryKey(),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id),
  permissionId: text("permission_id")
    .notNull()
    .references(() => permissions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// ─────────────────────────────────────────────────────────────
// 7. USER_COMPANY_ROLES
// One active role per user per company (UNIQUE enforced).
// ─────────────────────────────────────────────────────────────
export const userCompanyRoles = pgTable(
  "user_company_roles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    isActive: boolean("is_active").default(true).notNull(),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => users.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    userCompanyUnique: uniqueIndex("uq_ucr_user_company").on(
      table.userId,
      table.companyId
    ),
  })
);

// ─────────────────────────────────────────────────────────────
// 8. SESSIONS
// Server-side sessions. No JWT — token lives here.
// ─────────────────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),       // UUID v4 = the session token
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  companyId: text("company_id")
    .references(() => companies.id), // nullable for super_admin global sessions
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull(),
  isValid: boolean("is_valid").default(true).notNull(),
}, (table) => ({
  idxSessionsUserId:  index("idx_sessions_user_id").on(table.userId),
  idxSessionsValid:   index("idx_sessions_is_valid").on(table.isValid),
}));

// ─────────────────────────────────────────────────────────────
// 9. AUDIT_LOGS
// Immutable forensic ledger. SHA-256 chained entries.
// Only INSERT allowed — no UPDATE/DELETE (enforced by trigger).
// ─────────────────────────────────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .references(() => companies.id),
  userId: text("user_id")
    .references(() => users.id),
  sessionId: text("session_id")
    .references(() => sessions.id),
  action: text("action").notNull(),
  module: text("module").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  beforeState: text("before_state"),      // JSON string
  afterState: text("after_state"),        // JSON string
  ipAddress: text("ip_address").notNull(),
  entryHash: text("entry_hash").notNull(),
  prevHash: text("prev_hash").notNull(),
  chainIndex: integer("chain_index").notNull(),
  timestampToken: text("timestamp_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => ({
  idxAuditCompanyCreated: index("idx_audit_company_created").on(table.companyId, table.createdAt),
  idxAuditModule:         index("idx_audit_module").on(table.module),
}));

// ─────────────────────────────────────────────────────────────
// 10. FISCAL_PERIODS
// Controls period open/close/lock lifecycle per company.
// ─────────────────────────────────────────────────────────────
export const fiscalPeriods = pgTable("fiscal_periods", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  name: text("name").notNull(), // e.g. "Enero 2026"
  periodType: text("period_type").notNull(), // monthly|quarterly|annual
  startDate: text("start_date").notNull(),   // ISO 8601 date string YYYY-MM-DD
  endDate: text("end_date").notNull(),       // ISO 8601 date string YYYY-MM-DD
  status: text("status").default("open").notNull(), // open|closed|locked
  closedBy: text("closed_by")
    .references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
