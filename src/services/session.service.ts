// ============================================================
// SESSION SERVICE
// Server-side sessions stored in DB (no JWT).
// Token = UUID v4 stored in HttpOnly SameSite=Strict cookie.
// Sliding 8-hour expiration window reset on each valid request.
// ============================================================

import { rawDb } from "../db/connection.ts";
import { v4 as uuidv4 } from "uuid";

const SESSION_DURATION_HOURS = 8;

function expiresAt(fromNow = SESSION_DURATION_HOURS): string {
  return new Date(
    Date.now() + fromNow * 60 * 60 * 1000
  ).toISOString();
}

// ── Create a new session ─────────────────────────────────────
export function createSession(opts: {
  userId:    string;
  companyId: string | null;
  ipAddress: string;
  userAgent: string | null;
}): string {
  const id  = uuidv4();
  const now = new Date().toISOString();

  rawDb
    .prepare(
      `INSERT INTO sessions
         (id, user_id, company_id, ip_address, user_agent,
          created_at, expires_at, last_active_at, is_valid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      id,
      opts.userId,
      opts.companyId,
      opts.ipAddress,
      opts.userAgent,
      now,
      expiresAt(),
      now
    );

  return id; // returned as cookie value
}

// ── Validate & slide session window ─────────────────────────
// Returns user data if valid, null otherwise.
export interface ValidSession {
  sessionId: string;
  userId:    string;
  companyId: string | null;
}

export function validateSession(token: string): ValidSession | null {
  const session = rawDb
    .query(
      `SELECT id, user_id, company_id, expires_at, is_valid
       FROM sessions
       WHERE id = ?`
    )
    .get(token) as {
      id: string;
      user_id: string;
      company_id: string | null;
      expires_at: string;
      is_valid: number;
    } | null;

  if (!session || !session.is_valid) return null;
  if (new Date(session.expires_at) < new Date()) {
    // Expired — invalidate it
    rawDb
      .prepare("UPDATE sessions SET is_valid = 0 WHERE id = ?")
      .run(token);
    return null;
  }

  // Slide the window
  rawDb
    .prepare(
      "UPDATE sessions SET last_active_at = ?, expires_at = ? WHERE id = ?"
    )
    .run(new Date().toISOString(), expiresAt(), token);

  return {
    sessionId: session.id,
    userId:    session.user_id,
    companyId: session.company_id,
  };
}

// ── Invalidate a specific session (logout) ───────────────────
export function invalidateSession(token: string): void {
  rawDb
    .prepare("UPDATE sessions SET is_valid = 0 WHERE id = ?")
    .run(token);
}

// ── Invalidate all sessions for a user (admin force-logout) ──
export function invalidateAllUserSessions(userId: string): number {
  const result = rawDb
    .prepare(
      "UPDATE sessions SET is_valid = 0 WHERE user_id = ? AND is_valid = 1"
    )
    .run(userId);
  return result.changes;
}

// ── Switch active company within a session ───────────────────
export function switchSessionCompany(
  sessionId: string,
  companyId: string
): void {
  rawDb
    .prepare(
      "UPDATE sessions SET company_id = ?, last_active_at = ? WHERE id = ?"
    )
    .run(companyId, new Date().toISOString(), sessionId);
}

// ── List active sessions for a user (admin view) ─────────────
export function listActiveSessions(userId: string) {
  return rawDb
    .query(
      `SELECT id, company_id, ip_address, user_agent, created_at, expires_at, last_active_at
       FROM sessions
       WHERE user_id = ? AND is_valid = 1
       ORDER BY last_active_at DESC`
    )
    .all(userId);
}

