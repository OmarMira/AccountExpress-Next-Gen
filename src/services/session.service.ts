// ============================================================
// SESSION SERVICE — PostgreSQL 16 / Drizzle ORM
// Server-side sessions stored in DB (no JWT).
// ============================================================

import { db } from "../db/connection.ts";
import { sessions, userCompanyRoles } from "../db/schema/index.ts";
import { eq, and, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const SESSION_DURATION_HOURS = 8;

function expiresAt(fromNow = SESSION_DURATION_HOURS): Date {
  return new Date(Date.now() + fromNow * 60 * 60 * 1000);
}

// ── Create a new session ─────────────────────────────────────
export async function createSession(opts: {
  userId:    string;
  companyId: string | null;
  ipAddress: string;
  userAgent: string | null;
}): Promise<string> {
  const id  = uuidv4();
  const now = new Date();

  await db.insert(sessions).values({
    id,
    userId:       opts.userId,
    companyId:    opts.companyId,
    ipAddress:    opts.ipAddress,
    userAgent:    opts.userAgent,
    createdAt:    now,
    expiresAt:    expiresAt(),
    lastActiveAt: now,
    isValid:      true,
  });

  return id;
}


// ── Invalidate a specific session (logout) ───────────────────
export async function invalidateSession(token: string): Promise<void> {
  await db.update(sessions)
    .set({ isValid: false })
    .where(eq(sessions.id, token));
}

// ── Invalidate all sessions for a user ──────────────────────
export async function invalidateAllUserSessions(userId: string): Promise<number> {
  const result = await db.update(sessions)
    .set({ isValid: false })
    .where(and(eq(sessions.userId, userId), eq(sessions.isValid, true)));
  // postgres.js returns an array of affected rows; rowCount from the command tag
  return (result as unknown as { count: number }).count ?? 0;
}

// ── Switch active company within a session ───────────────────
export async function switchSessionCompany(
  sessionId: string,
  companyId: string
): Promise<void> {
  const [session] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.isValid, true)))
    .limit(1);

  if (!session) throw new Error("Session not found or invalid.");

  const membership = await db.query.userCompanyRoles.findFirst({
    where: and(
      eq(userCompanyRoles.userId, session.userId),
      eq(userCompanyRoles.companyId, companyId),
      eq(userCompanyRoles.isActive, true),
      isNull(userCompanyRoles.revokedAt)
    ),
  });

  if (!membership) throw new Error("User does not belong to the requested company.");

  await db.update(sessions)
    .set({ companyId, lastActiveAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

// ── List active sessions for a user ─────────────────────────
export async function listActiveSessions(userId: string) {
  return db
    .select({
      id:           sessions.id,
      companyId:    sessions.companyId,
      ipAddress:    sessions.ipAddress,
      userAgent:    sessions.userAgent,
      createdAt:    sessions.createdAt,
      expiresAt:    sessions.expiresAt,
      lastActiveAt: sessions.lastActiveAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.isValid, true)))
    .orderBy(sessions.lastActiveAt);
}
