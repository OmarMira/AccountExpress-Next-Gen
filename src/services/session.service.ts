// src/services/session.service.ts
import { db } from "../db/connection.ts";
import { sessions } from "../db/schema/index.ts";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export interface CreateSessionInput {
  userId:    string;
  companyId: string | null;
  ipAddress: string;
  userAgent: string | null;
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const sessionId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours

  await db.insert(sessions).values({
    id: sessionId,
    userId: input.userId,
    companyId: input.companyId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    createdAt: now,
    expiresAt,
    lastActiveAt: now,
    isValid: true,
  });

  return sessionId;
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ isValid: false })
    .where(eq(sessions.id, sessionId));
}

export async function invalidateAllUserSessions(userId: string): Promise<number> {
  const result = await db
    .update(sessions)
    .set({ isValid: false })
    .where(and(eq(sessions.userId, userId), eq(sessions.isValid, true)));
  
  return result.rowCount ?? 0;
}

export async function listActiveSessions(userId: string) {
  return await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.isValid, true)));
}

/**
 * Updates the company context of an existing session.
 */
export async function switchSessionCompany(sessionId: string, companyId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ companyId, lastActiveAt: new Date() })
    .where(eq(sessions.id, sessionId));
}
