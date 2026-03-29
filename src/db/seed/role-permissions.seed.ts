// ============================================================
// ROLE-PERMISSIONS MATRIX SEED
// Maps each system role to its allowed permissions.
// super_admin  → all 28
// company_admin → all except audit chain / company:create
// accountant   → journal + bank + accounts + reports
// auditor      → read + export only (no write anywhere)
// ============================================================

import { SYSTEM_ROLES_IDS } from "./roles.seed.ts";
import { PERMISSIONS_SEED } from "./permissions.seed.ts";
import { v4 as uuidv4 } from "uuid";

const NOW = new Date().toISOString();

function permId(module: string, action: string): string {
  const p = PERMISSIONS_SEED.find(
    (x) => x.module === module && x.action === action
  );
  if (!p) throw new Error(`Permission not found: ${module}:${action}`);
  return p.id;
}

// ── ALL 28 PERMISSION IDs ────────────────────────────────────
const ALL_PERMISSION_IDS = PERMISSIONS_SEED.map((p) => p.id);

// ── COMPANY ADMIN: all except companies:create ───────────────
const COMPANY_ADMIN_PERMS = ALL_PERMISSION_IDS.filter(
  (id) => id !== permId("companies", "create")
);

// ── ACCOUNTANT: journal (all) + bank (all) + accounts (r/w) + reports (all) ──
const ACCOUNTANT_PERMS = [
  permId("journal",  "create"),
  permId("journal",  "read"),
  permId("journal",  "update"),
  permId("journal",  "delete"),
  permId("journal",  "export"),
  permId("journal",  "approve"),
  permId("journal",  "close"),
  permId("journal",  "void"),
  permId("bank",     "create"),
  permId("bank",     "read"),
  permId("bank",     "export"),
  permId("bank",     "approve"),
  permId("accounts", "create"),
  permId("accounts", "read"),
  permId("accounts", "update"),
  permId("reports",  "read"),
  permId("reports",  "export"),
  permId("periods",  "close"),
];

// ── AUDITOR: read + export only across all modules ───────────
const AUDITOR_PERMS = PERMISSIONS_SEED
  .filter((p) => p.action === "read" || p.action === "export")
  .map((p) => p.id);

// ── BUILD JUNCTION RECORDS ───────────────────────────────────
function buildMatrix(roleId: string, permIds: string[]) {
  return permIds.map((permissionId) => ({
    id: uuidv4(),
    roleId,
    permissionId,
    createdAt: NOW,
  }));
}

export const ROLE_PERMISSIONS_SEED = [
  ...buildMatrix(SYSTEM_ROLES_IDS.superAdmin,   ALL_PERMISSION_IDS),
  ...buildMatrix(SYSTEM_ROLES_IDS.companyAdmin, COMPANY_ADMIN_PERMS),
  ...buildMatrix(SYSTEM_ROLES_IDS.accountant,   ACCOUNTANT_PERMS),
  ...buildMatrix(SYSTEM_ROLES_IDS.auditor,      AUDITOR_PERMS),
];

