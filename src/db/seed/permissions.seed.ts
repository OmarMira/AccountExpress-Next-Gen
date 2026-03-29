// ============================================================
// PERMISSIONS SEED DATA
// 28 base permissions across 7 modules × up to 7 actions.
// Format: module:action
// These are system permissions — cannot be deleted.
// ============================================================

export interface PermissionSeed {
  id: string;
  module: string;
  action: string;
  description: string;
  createdAt: string;
}

const NOW = new Date().toISOString();

// Deterministic IDs: "perm-{module:5}-{action:6}-{seq:2}"
export const PERMISSIONS_SEED: PermissionSeed[] = [
  // ── JOURNAL (7 permissions) ────────────────────────────────
  { id: "perm-journ-create-01", module: "journal", action: "create",  description: "Create draft journal entries",           createdAt: NOW },
  { id: "perm-journ-read--02", module: "journal", action: "read",    description: "View journal entries",                   createdAt: NOW },
  { id: "perm-journ-update-03", module: "journal", action: "update",  description: "Edit draft journal entries",             createdAt: NOW },
  { id: "perm-journ-delete-04", module: "journal", action: "delete",  description: "Delete draft journal entries",           createdAt: NOW },
  { id: "perm-journ-export-05", module: "journal", action: "export",  description: "Export journal to CSV/PDF",              createdAt: NOW },
  { id: "perm-journ-approv-06", module: "journal", action: "approve", description: "Post (approve) journal entries",         createdAt: NOW },
  { id: "perm-journ-close-07", module: "journal", action: "close",   description: "Void posted journal entries",            createdAt: NOW },

  // ── BANK (4 permissions) ───────────────────────────────────
  { id: "perm-bank--create-08", module: "bank", action: "create",  description: "Add manual bank transactions",             createdAt: NOW },
  { id: "perm-bank--read--09", module: "bank", action: "read",    description: "View bank transactions",                   createdAt: NOW },
  { id: "perm-bank--export-10", module: "bank", action: "export",  description: "Export bank transactions to CSV",          createdAt: NOW },
  { id: "perm-bank--approv-11", module: "bank", action: "approve", description: "Reconcile/match bank transactions",        createdAt: NOW },

  // ── ACCOUNTS / CHART OF ACCOUNTS (4 permissions) ──────────
  { id: "perm-accts-create-12", module: "accounts", action: "create", description: "Add new accounts to chart",             createdAt: NOW },
  { id: "perm-accts-read--13", module: "accounts", action: "read",   description: "View chart of accounts",                createdAt: NOW },
  { id: "perm-accts-update-14", module: "accounts", action: "update", description: "Edit account names and metadata",       createdAt: NOW },
  { id: "perm-accts-delete-15", module: "accounts", action: "delete", description: "Deactivate (soft delete) accounts",     createdAt: NOW },

  // ── REPORTS (2 permissions) ────────────────────────────────
  { id: "perm-reprt-read--16", module: "reports", action: "read",   description: "View financial reports",                  createdAt: NOW },
  { id: "perm-reprt-export-17", module: "reports", action: "export", description: "Export financial reports to PDF/CSV",     createdAt: NOW },

  // ── USERS (4 permissions) ──────────────────────────────────
  { id: "perm-users-create-18", module: "users", action: "create", description: "Create new users",                         createdAt: NOW },
  { id: "perm-users-read--19", module: "users", action: "read",   description: "View user list and profiles",               createdAt: NOW },
  { id: "perm-users-update-20", module: "users", action: "update", description: "Edit user profiles and reset passwords",   createdAt: NOW },
  { id: "perm-users-delete-21", module: "users", action: "delete", description: "Deactivate user accounts",                 createdAt: NOW },

  // ── COMPANIES (4 permissions) ──────────────────────────────
  { id: "perm-comps-create-22", module: "companies", action: "create", description: "Create new companies",                 createdAt: NOW },
  { id: "perm-comps-read--23", module: "companies", action: "read",   description: "View company details",                  createdAt: NOW },
  { id: "perm-comps-update-24", module: "companies", action: "update", description: "Edit company settings",                createdAt: NOW },
  { id: "perm-comps-close-25", module: "companies", action: "close",  description: "Archive/deactivate companies",          createdAt: NOW },

  // ── AUDIT (3 permissions) ──────────────────────────────────
  { id: "perm-audit-read--26", module: "audit", action: "read",   description: "View audit log entries",                    createdAt: NOW },
  { id: "perm-audit-export-27", module: "audit", action: "export", description: "Export audit logs to CSV",                 createdAt: NOW },
  { id: "perm-audit-close-28", module: "audit", action: "close",  description: "Open/close fiscal periods",                 createdAt: NOW },
  
  // ── NEW PERMISSIONS (v1.0.1) ───────────────────────────────
  { id: "perm-journ-void--29", module: "journal", action: "void",  description: "Void posted journal entries (reversing)",    createdAt: NOW },
  { id: "perm-perio-close-30", module: "periods", action: "close", description: "Close/Open fiscal periods",                 createdAt: NOW },
];

