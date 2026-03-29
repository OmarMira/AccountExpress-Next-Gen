// ============================================================
// MASTER SEED ORCHESTRATOR — PostgreSQL 16
// Runs in exact dependency order:
//   1. system_config
//   2. roles
//   3. permissions
//   4. role_permissions
//   5. super_admin user (bcrypt hashed)
//
// IDEMPOTENT: checks existence before inserting using ON CONFLICT.
// Run with: bun run src/db/seed/seed.ts
// ============================================================

import { db } from "../connection.ts";
import { runMigrations } from "../migrate.ts";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { systemConfig, roles, permissions, rolePermissions, users } from "../schema/index.ts";
import { ROLES_SEED } from "./roles.seed.ts";
import { PERMISSIONS_SEED } from "./permissions.seed.ts";
import { ROLE_PERMISSIONS_SEED } from "./role-permissions.seed.ts";
import { count, eq } from "drizzle-orm";

const NOW = new Date();

// ── 0. RUN MIGRATIONS FIRST ──────────────────────────────────
async function runMigrationsIfMain() {
  console.log("[SEED] Ensuring schema is up to date...");
  await runMigrations();
}

// ── 1. SYSTEM_CONFIG ─────────────────────────────────────────
async function seedSystemConfig(): Promise<void> {
  const [existing] = await db.select({ id: systemConfig.id }).from(systemConfig).limit(1);
  if (existing) {
    console.log("[SEED] ✓ system_config already seeded — skipping");
    return;
  }
  await db.insert(systemConfig).values({
    id: uuidv4(),
    schemaVersion: "1.0.0",
    appName: process.env["APP_NAME"] ?? "Account Express Bookkeeping Core",
    licenseKey: null,
    maxCompanies: 999,
    maintenanceMode: false,
    createdAt: NOW,
    updatedAt: NOW
  });
  console.log("[SEED] ✓ system_config seeded");
}

// ── 2. ROLES ─────────────────────────────────────────────────
async function seedRoles(): Promise<void> {
  const [result] = await db.select({ c: count() }).from(roles);
  if (result && result.c > 0) {
    console.log("[SEED] ✓ roles already seeded — skipping");
    return;
  }
  for (const r of ROLES_SEED) {
    await db.insert(roles).values({
      id:          r.id,
      name:        r.name,
      displayName: r.displayName,
      description: r.description,
      isSystem:    r.isSystem === 1,
      isActive:    r.isActive === 1,
      createdAt:   new Date(r.createdAt),
    }).onConflictDoNothing();
  }
  console.log(`[SEED] ✓ ${ROLES_SEED.length} roles seeded`);
}

// ── 3. PERMISSIONS ───────────────────────────────────────────
async function seedPermissions(): Promise<void> {
  const [result] = await db.select({ c: count() }).from(permissions);
  if (result && result.c > 0) {
    console.log("[SEED] ✓ permissions already seeded — skipping");
    return;
  }
  for (const p of PERMISSIONS_SEED) {
    await db.insert(permissions).values({
      id:          p.id,
      module:      p.module,
      action:      p.action,
      description: p.description,
      createdAt:   new Date(p.createdAt),
    }).onConflictDoNothing();
  }
  console.log(`[SEED] ✓ ${PERMISSIONS_SEED.length} permissions seeded`);
}

// ── 4. ROLE_PERMISSIONS ──────────────────────────────────────
async function seedRolePermissions(): Promise<void> {
  const [result] = await db.select({ c: count() }).from(rolePermissions);
  if (result && result.c > 0) {
    console.log("[SEED] ✓ role_permissions already seeded — skipping");
    return;
  }
  for (const rp of ROLE_PERMISSIONS_SEED) {
    await db.insert(rolePermissions).values({
      id:           rp.id,
      roleId:       rp.roleId,
      permissionId: rp.permissionId,
      createdAt:    new Date(rp.createdAt),
    }).onConflictDoNothing();
  }
  console.log(`[SEED] ✓ ${ROLE_PERMISSIONS_SEED.length} role_permissions seeded`);
}

// ── 5. SUPER ADMIN USER ──────────────────────────────────────
async function seedSuperAdmin(): Promise<void> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.isSuperAdmin, true)).limit(1);
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

  await db.insert(users).values({
    id:                 uuidv4(),
    username:           username,
    email:              email,
    passwordHash:       hash,
    passwordSalt:       salt,
    firstName:          "Super",
    lastName:           "Admin",
    isSuperAdmin:       true,
    isActive:           true,
    isLocked:           false,
    failedAttempts:     0,
    mustChangePassword: true,
    createdAt:          NOW,
    updatedAt:          NOW
  });
  console.log(`[SEED] ✓ super_admin seeded — username: ${username}`);
  console.log(`[SEED] ⚠  must_change_password=true — user must change on first login`);
}

// ── ORCHESTRATOR ─────────────────────────────────────────────
async function runSeed(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Account Express Bookkeeping Core — SEED");
  console.log("═══════════════════════════════════════════════\n");

  await runMigrationsIfMain();
  await seedSystemConfig();
  await seedRoles();
  await seedPermissions();
  await seedRolePermissions();
  await seedSuperAdmin();

  console.log("\n[SEED] ✅ Seed complete. System is ready.\n");
}

// ── DIRECT RUN ───────────────────────────────────────────────
if (import.meta.main) {
  runSeed().then(() => process.exit(0)).catch((err) => {
    console.error("[SEED] ❌ Fatal error:", err);
    process.exit(1);
  });
}

export { runSeed };
