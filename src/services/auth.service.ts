// ============================================================
// AUTH SERVICE
// bcrypt password hashing (cost 12) and account lockout logic.
// SECURITY RULES:
//   - 5 consecutive failed attempts → is_locked=1, locked_until=NOW+30min
//   - Super Admin can unlock manually
//   - bcrypt cost 12 = ~300ms per hash (intentional brute-force deterrent)
// ============================================================

import bcrypt from "bcryptjs";
import { rawDb } from "../db/connection.ts";

const BCRYPT_ROUNDS   = parseInt(process.env["BCRYPT_ROUNDS"] ?? "12", 10);
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
// Increments counter; locks account after MAX_ATTEMPTS failures.
export function recordFailedAttempt(userId: string): void {
  const user = rawDb
    .query("SELECT failed_attempts FROM users WHERE id = ?")
    .get(userId) as { failed_attempts: number } | null;

  if (!user) return;

  const newCount = user.failed_attempts + 1;

  if (newCount >= MAX_ATTEMPTS) {
    const lockedUntil = new Date(
      Date.now() + LOCKOUT_MINUTES * 60 * 1000
    ).toISOString();
    rawDb
      .prepare(
        `UPDATE users SET
           failed_attempts = ?,
           is_locked       = 1,
           locked_until    = ?,
           updated_at      = ?
         WHERE id = ?`
      )
      .run(newCount, lockedUntil, new Date().toISOString(), userId);
  } else {
    rawDb
      .prepare(
        `UPDATE users SET
           failed_attempts = ?,
           updated_at      = ?
         WHERE id = ?`
      )
      .run(newCount, new Date().toISOString(), userId);
  }
}

// ── Reset failed attempts on successful login ────────────────
export function resetFailedAttempts(userId: string): void {
  rawDb
    .prepare(
      `UPDATE users SET
         failed_attempts = 0,
         is_locked       = 0,
         locked_until    = NULL,
         last_login_at   = ?,
         updated_at      = ?
       WHERE id = ?`
    )
    .run(new Date().toISOString(), new Date().toISOString(), userId);
}

// ── Check if account is currently locked ─────────────────────
export function isAccountLocked(userId: string): { locked: boolean; until: string | null } {
  const user = rawDb
    .query("SELECT is_locked, locked_until FROM users WHERE id = ?")
    .get(userId) as { is_locked: number; locked_until: string | null } | null;

  if (!user) return { locked: false, until: null };
  if (!user.is_locked) return { locked: false, until: null };

  // Auto-expire: if lockout time has passed, release the lock
  if (user.locked_until && new Date(user.locked_until) <= new Date()) {
    rawDb
      .prepare(
        `UPDATE users SET
           is_locked       = 0,
           locked_until    = NULL,
           failed_attempts = 0,
           updated_at      = ?
         WHERE id = ?`
      )
      .run(new Date().toISOString(), userId);
    return { locked: false, until: null };
  }

  return { locked: true, until: user.locked_until };
}

// ── Manually unlock account (super_admin action) ─────────────
export function unlockAccount(userId: string): void {
  rawDb
    .prepare(
      `UPDATE users SET
         is_locked       = 0,
         locked_until    = NULL,
         failed_attempts = 0,
         updated_at      = ?
       WHERE id = ?`
    )
    .run(new Date().toISOString(), userId);
}

// ── Force password change flag ────────────────────────────────
export function requirePasswordChange(userId: string): void {
  rawDb
    .prepare(
      `UPDATE users SET must_change_password = 1, updated_at = ? WHERE id = ?`
    )
    .run(new Date().toISOString(), userId);
}

// ── Update last login IP ──────────────────────────────────────
export function updateLastLogin(userId: string, ip: string): void {
  rawDb
    .prepare(
      `UPDATE users SET
         last_login_at = ?,
         last_login_ip = ?,
         updated_at    = ?
       WHERE id = ?`
    )
    .run(new Date().toISOString(), ip, new Date().toISOString(), userId);
}

