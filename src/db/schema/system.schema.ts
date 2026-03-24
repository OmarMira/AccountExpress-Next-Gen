// ============================================================
// SYSTEM INFRASTRUCTURE SCHEMA
// Group A — 10 tables: security, multitenancy, audit
// RULE: No file > 500 lines. One file = one responsibility group.
// ============================================================

import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// 1. SYSTEM_CONFIG
// Single-row global installation configuration.
// ─────────────────────────────────────────────────────────────
export const systemConfig = sqliteTable("system_config", {
  id: text("id").primaryKey(), // UUID v4
  schemaVersion: text("schema_version").notNull(),
  appName: text("app_name").notNull(),
  licenseKey: text("license_key"),
  maxCompanies: integer("max_companies").default(999).notNull(),
  maintenanceMode: integer("maintenance_mode").default(0).notNull(), // 0|1 flag
  backupScheduleHour: integer("backup_schedule_hour"), // nullable
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─────────────────────────────────────────────────────────────
// 2. COMPANIES
// Each row = fully isolated tenant. All accounting data
// references company_id as mandatory FK.
// ─────────────────────────────────────────────────────────────
export const companies = sqliteTable("companies", {
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
  isActive: integer("is_active").default(1).notNull(), // 0|1 flag
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─────────────────────────────────────────────────────────────
// 3. USERS
// Passwords NEVER stored in plain text.
// bcrypt cost 12 = ~300ms per hash (brute-force deterrent).
// After 5 failed consecutive attempts → locked for 30 min.
// ─────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // bcrypt hash, cost 12
  passwordSalt: text("password_salt").notNull(), // random salt per user
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  isSuperAdmin: integer("is_super_admin").default(0).notNull(), // 0|1
  isActive: integer("is_active").default(1).notNull(),           // 0|1
  isLocked: integer("is_locked").default(0).notNull(),           // 0|1
  failedAttempts: integer("failed_attempts").default(0).notNull(),
  lockedUntil: text("locked_until"),           // ISO 8601 UTC — null if not locked
  lastLoginAt: text("last_login_at"),          // ISO 8601 UTC
  lastLoginIp: text("last_login_ip"),
  mustChangePassword: integer("must_change_password").default(0).notNull(), // 0|1
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─────────────────────────────────────────────────────────────
// 4. ROLES
// 4 system roles (is_system=1) cannot be deleted.
// Custom roles can be created per company.
// ─────────────────────────────────────────────────────────────
export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),         // e.g. "super_admin"
  displayName: text("display_name").notNull(),   // e.g. "Super Administrador"
  description: text("description"),
  isSystem: integer("is_system").default(0).notNull(), // 1 = cannot be deleted
  isActive: integer("is_active").default(1).notNull(),
  createdAt: text("created_at").notNull(),
});

// ─────────────────────────────────────────────────────────────
// 5. PERMISSIONS
// Granular module:action pairs.
// Format: "journal:create", "bank:reconcile", "reports:export"
// UNIQUE constraint on (module, action).
// ─────────────────────────────────────────────────────────────
export const permissions = sqliteTable(
  "permissions",
  {
    id: text("id").primaryKey(),
    module: text("module").notNull(), // journal|bank|accounts|reports|users|companies|audit
    action: text("action").notNull(), // create|read|update|delete|export|approve|close
    description: text("description"),
    createdAt: text("created_at").notNull(),
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
// Junction table: which permissions does each role have.
// ─────────────────────────────────────────────────────────────
export const rolePermissions = sqliteTable("role_permissions", {
  id: text("id").primaryKey(),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id),
  permissionId: text("permission_id")
    .notNull()
    .references(() => permissions.id),
  createdAt: text("created_at").notNull(),
});

// ─────────────────────────────────────────────────────────────
// 7. USER_COMPANY_ROLES
// Multi-tenant access control heart.
// One active role per user per company (UNIQUE enforced).
// To change role: revoke current → create new (full history).
// ─────────────────────────────────────────────────────────────
export const userCompanyRoles = sqliteTable(
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
    isActive: integer("is_active").default(1).notNull(),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => users.id),
    grantedAt: text("granted_at").notNull(),
    revokedAt: text("revoked_at"), // NULL = still active
  },
  (table) => ({
    // One active role per user per company
    userCompanyUnique: uniqueIndex("uq_ucr_user_company").on(
      table.userId,
      table.companyId
    ),
  })
);

// ─────────────────────────────────────────────────────────────
// 8. SESSIONS
// Server-side sessions. No JWT — token lives here.
// Stored in HttpOnly cookie, invalidated server-side.
// Sliding 8-hour expiration window.
// ─────────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),       // UUID v4 = the session token
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  companyId: text("company_id")
    .references(() => companies.id), // nullable for super_admin global sessions
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),   // ISO 8601 UTC
  lastActiveAt: text("last_active_at").notNull(), // sliding window updated on each request
  isValid: integer("is_valid").default(1).notNull(), // 0 = invalidated
});

// ─────────────────────────────────────────────────────────────
// 9. AUDIT_LOGS
// Immutable forensic ledger. SHA-256 chained entries.
// Only INSERT allowed — no UPDATE/DELETE (enforced by trigger).
// entry_hash = SHA-256(id + user_id + action + after_state + prev_hash + created_at)
// ─────────────────────────────────────────────────────────────
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .references(() => companies.id), // NULL for system-level ops
  userId: text("user_id")
    .references(() => users.id),
  sessionId: text("session_id")
    .references(() => sessions.id),
  action: text("action").notNull(),       // e.g. "journal:create"
  module: text("module").notNull(),       // journal|bank|accounts|users...
  entityType: text("entity_type"),        // e.g. "journal_entry"
  entityId: text("entity_id"),
  beforeState: text("before_state"),      // JSON of prior state (UPDATE/DELETE)
  afterState: text("after_state"),        // JSON of new state
  ipAddress: text("ip_address").notNull(),
  entryHash: text("entry_hash").notNull(),  // SHA-256 of this record
  prevHash: text("prev_hash").notNull(),    // SHA-256 of prior record (chain link)
  chainIndex: integer("chain_index").notNull(), // sequential chain position
  timestampToken: text("timestamp_token"),  // RFC 3161 base64 (external TSA, optional)
  createdAt: text("created_at").notNull(),
});

// ─────────────────────────────────────────────────────────────
// 10. FISCAL_PERIODS
// Controls period open/close/lock lifecycle per company.
// A "locked" period cannot be re-opened under any circumstances.
// Overlap validation is enforced at service layer before DB write.
// ─────────────────────────────────────────────────────────────
export const fiscalPeriods = sqliteTable("fiscal_periods", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  name: text("name").notNull(), // e.g. "Enero 2026"
  periodType: text("period_type").notNull(), // monthly|quarterly|annual
  startDate: text("start_date").notNull(),   // ISO 8601 UTC
  endDate: text("end_date").notNull(),       // ISO 8601 UTC
  status: text("status").default("open").notNull(), // open|closed|locked
  closedBy: text("closed_by")
    .references(() => users.id),
  closedAt: text("closed_at"),
  createdAt: text("created_at").notNull(),
});

