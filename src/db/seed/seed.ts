// ============================================================
// MASTER SEED ORCHESTRATOR
// Runs in exact dependency order:
//   1. system_config
//   2. roles
//   3. permissions
//   4. role_permissions
//   5. super_admin user (bcrypt hashed)
//   6. GAAP chart of accounts (if a demo company is specified)
//
// IDEMPOTENT: checks existence before inserting.
// Run with: bun run src/db/seed/seed.ts
// ============================================================

import { rawDb } from "../connection.ts";
import { runMigrations } from "../migrate.ts";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { ROLES_SEED } from "./roles.seed.ts";
import { PERMISSIONS_SEED } from "./permissions.seed.ts";
import { ROLE_PERMISSIONS_SEED } from "./role-permissions.seed.ts";

const NOW = new Date().toISOString();

// ── 0. RUN MIGRATIONS FIRST ──────────────────────────────────
console.log("[SEED] Ensuring schema is up to date...");
runMigrations();

// ── 1. SYSTEM_CONFIG ─────────────────────────────────────────
function seedSystemConfig(): void {
  const existing = rawDb
    .query("SELECT id FROM system_config LIMIT 1")
    .get();
  if (existing) {
    console.log("[SEED] ✓ system_config already seeded — skipping");
    return;
  }
  rawDb
    .prepare(
      `INSERT INTO system_config
         (id, schema_version, app_name, license_key, max_companies, maintenance_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      uuidv4(),
      "1.0.0",
      process.env["APP_NAME"] ?? "Account Express Bookkeeping Core",
      null,
      999,
      0,
      NOW,
      NOW
    );
  console.log("[SEED] ✓ system_config seeded");
}

// ── 2. ROLES ─────────────────────────────────────────────────
function seedRoles(): void {
  const count = (rawDb.query("SELECT COUNT(*) as c FROM roles").get() as { c: number }).c;
  if (count > 0) {
    console.log("[SEED] ✓ roles already seeded — skipping");
    return;
  }
  const stmt = rawDb.prepare(
    `INSERT INTO roles (id, name, display_name, description, is_system, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of ROLES_SEED) {
    stmt.run(r.id, r.name, r.displayName, r.description, r.isSystem, r.isActive, r.createdAt);
  }
  console.log(`[SEED] ✓ ${ROLES_SEED.length} roles seeded`);
}

// ── 3. PERMISSIONS ───────────────────────────────────────────
function seedPermissions(): void {
  const count = (rawDb.query("SELECT COUNT(*) as c FROM permissions").get() as { c: number }).c;
  if (count > 0) {
    console.log("[SEED] ✓ permissions already seeded — skipping");
    return;
  }
  const stmt = rawDb.prepare(
    `INSERT INTO permissions (id, module, action, description, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const p of PERMISSIONS_SEED) {
    stmt.run(p.id, p.module, p.action, p.description, p.createdAt);
  }
  console.log(`[SEED] ✓ ${PERMISSIONS_SEED.length} permissions seeded`);
}

// ── 4. ROLE_PERMISSIONS ──────────────────────────────────────
function seedRolePermissions(): void {
  const count = (rawDb.query("SELECT COUNT(*) as c FROM role_permissions").get() as { c: number }).c;
  if (count > 0) {
    console.log("[SEED] ✓ role_permissions already seeded — skipping");
    return;
  }
  const stmt = rawDb.prepare(
    `INSERT INTO role_permissions (id, role_id, permission_id, created_at)
     VALUES (?, ?, ?, ?)`
  );
  for (const rp of ROLE_PERMISSIONS_SEED) {
    stmt.run(rp.id, rp.roleId, rp.permissionId, rp.createdAt);
  }
  console.log(`[SEED] ✓ ${ROLE_PERMISSIONS_SEED.length} role_permissions seeded`);
}

// ── 5. SUPER ADMIN USER ──────────────────────────────────────
async function seedSuperAdmin(): Promise<void> {
  const existing = rawDb
    .query("SELECT id FROM users WHERE is_super_admin = 1 LIMIT 1")
    .get();
  if (existing) {
    console.log("[SEED] ✓ super_admin user already exists — skipping");
    return;
  }

  const username = process.env["SUPER_ADMIN_USERNAME"] ?? "admin";
  const email    = process.env["SUPER_ADMIN_EMAIL"]    ?? "admin@localhost";
  const password = process.env["SUPER_ADMIN_PASSWORD"] ?? "ChangeMe@2026!";

  const saltRounds = parseInt(process.env["BCRYPT_ROUNDS"] ?? "12", 10);
  const salt       = await bcrypt.genSalt(saltRounds);
  const hash       = await bcrypt.hash(password, salt);

  rawDb
    .prepare(
      `INSERT INTO users
         (id, username, email, password_hash, password_salt,
          first_name, last_name, is_super_admin, is_active,
          is_locked, failed_attempts, must_change_password,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 0, 1, ?, ?)`
    )
    .run(
      uuidv4(),
      username,
      email,
      hash,
      salt,
      "Super",
      "Admin",
      NOW,
      NOW
    );
  console.log(`[SEED] ✓ super_admin seeded — username: ${username}`);
  console.log(`[SEED] ⚠  must_change_password=1 — user must change on first login`);
}

// ── ORCHESTRATOR ─────────────────────────────────────────────
async function runSeed(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Account Express Bookkeeping Core — SEED");
  console.log("═══════════════════════════════════════════════\n");

  seedSystemConfig();
  seedRoles();
  seedPermissions();
  seedRolePermissions();
  await seedSuperAdmin();

  console.log("\n[SEED] ✅ Seed complete. System is ready.\n");
}

// ── DIRECT RUN ───────────────────────────────────────────────
if (import.meta.main) {
  runSeed().catch((err) => {
    console.error("[SEED] ❌ Fatal error:", err);
    process.exit(1);
  });
}

export { runSeed };
