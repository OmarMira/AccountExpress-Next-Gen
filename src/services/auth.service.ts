// ============================================================
// AUTH SERVICE — PostgreSQL 16 / Drizzle ORM
// bcrypt password hashing and account lockout logic.
// ============================================================

import bcrypt from "bcryptjs";
import { db, sql } from "../db/connection.ts";
import { env } from "../config/validate.ts";
import { users } from "../db/schema/index.ts";
import { eq } from "drizzle-orm";

const BCRYPT_ROUNDS   = env.BCRYPT_ROUNDS;
const MAX_ATTEMPTS    = 5;
const LOCKOUT_MINUTES = 30;

export interface HashResult {
  hash: string;
  salt: string;
}

// ── Hash a plain-text password ───────────────────────────────
export async function hashPassword(plain: string): Promise<HashResult> {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  const hash = await bcrypt.hash(plain, salt);
  return { hash, salt };
}

// ── Verify a password against a stored hash ──────────────────
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Record a failed login attempt ────────────────────────────
export async function recordFailedAttempt(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [user] = await tx.execute(sql`
      SELECT failed_attempts FROM users WHERE id = ${userId} FOR UPDATE
    `) as unknown as Array<{ failed_attempts: number | null }>;

    if (!user) return;

    const newCount = (user.failed_attempts ?? 0) + 1;
    const now = new Date();

    if (newCount >= MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      await tx.update(users)
        .set({
          failedAttempts: newCount,
          isLocked:       true,
          lockedUntil,
          updatedAt:      now,
        })
        .where(eq(users.id, userId));
    } else {
      await tx.update(users)
        .set({
          failedAttempts: newCount,
          updatedAt:      now,
        })
        .where(eq(users.id, userId));
    }
  });
}

// ── Reset failed attempts on successful login ────────────────
export async function resetFailedAttempts(userId: string): Promise<void> {
  const now = new Date();
  await db.update(users)
    .set({
      failedAttempts: 0,
      isLocked:       false,
      lockedUntil:    null,
      lastLoginAt:    now,
      updatedAt:      now,
    })
    .where(eq(users.id, userId));
}

// ── Check if account is currently locked ─────────────────────
export async function isAccountLocked(
  userId: string
): Promise<{ locked: boolean; until: string | null }> {
  const [user] = await db
    .select({ isLocked: users.isLocked, lockedUntil: users.lockedUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { locked: false, until: null };
  if (!user.isLocked) return { locked: false, until: null };

  // Auto-expire: if lockout time has passed, release the lock
  if (user.lockedUntil && user.lockedUntil <= new Date()) {
    await db.update(users)
      .set({
        isLocked:       false,
        lockedUntil:    null,
        failedAttempts: 0,
        updatedAt:      new Date(),
      })
      .where(eq(users.id, userId));
    return { locked: false, until: null };
  }

  return {
    locked: true,
    until:  user.lockedUntil ? user.lockedUntil.toISOString() : null,
  };
}

// ── Manually unlock account (super_admin action) ─────────────
export async function unlockAccount(userId: string): Promise<void> {
  await db.update(users)
    .set({
      isLocked:       false,
      lockedUntil:    null,
      failedAttempts: 0,
      updatedAt:      new Date(),
    })
    .where(eq(users.id, userId));
}

// ── Force password change flag ────────────────────────────────
export async function requirePasswordChange(userId: string): Promise<void> {
  await db.update(users)
    .set({ mustChangePassword: true, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// ── Update last login IP ──────────────────────────────────────
export async function updateLastLogin(userId: string, ip: string): Promise<void> {
  const now = new Date();
  await db.update(users)
    .set({ lastLoginAt: now, lastLoginIp: ip, updatedAt: now })
    .where(eq(users.id, userId));
}

export interface LoginResult {
  success:  boolean;
  error?:    "INVALID_CREDENTIALS" | "ACCOUNT_DEACTIVATED" | "ACCOUNT_LOCKED";
  until?:    string | null;
  userId?:   string;
  username?: string;
}

// ── Main Login logic ──────────────────────────────────────────
export async function login(
  username:  string,
  password:  string,
  ip:        string
): Promise<LoginResult> {
  const [user] = await db
    .select({
      id:           users.id,
      username:     users.username,
      passwordHash: users.passwordHash,
      isActive:     users.isActive,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return { success: false, error: "INVALID_CREDENTIALS" };
  }

  if (!user.isActive) {
    return { success: false, error: "ACCOUNT_DEACTIVATED" };
  }

  const lockStatus = await isAccountLocked(user.id);
  if (lockStatus.locked) {
    return { success: false, error: "ACCOUNT_LOCKED", until: lockStatus.until };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailedAttempt(user.id);
    return { success: false, error: "INVALID_CREDENTIALS" };
  }

  await resetFailedAttempts(user.id);
  await updateLastLogin(user.id, ip);
  return { success: true, userId: user.id, username: user.username };
}

// ── Timing Attack Mitigation ──────────────────────────────────
export const DUMMY_HASH =
  "$2b$12$invalidhashfortimingprotectiononly000000000000000000000";
