import { db } from "../../db/connection.ts";
import { sessions } from "../../db/schema/system.schema.ts";
import { eq, lte } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

interface SessionPayload {
  userId: string;
  companyId?: string | null;
  ipAddress: string;
  userAgent?: string | null;
}

export async function createSession({ userId, companyId, ipAddress, userAgent }: SessionPayload): Promise<string> {
  const sessionId = uuidv4();
  const now = new Date();
  
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8-hour window
  
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    companyId: companyId ?? null,
    ipAddress,
    userAgent: userAgent ?? null,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastActiveAt: now.toISOString(),
    isValid: 1
  });

  return sessionId;
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.update(sessions)
    .set({ isValid: 0 })
    .where(eq(sessions.id, sessionId));
}

export async function cleanExpiredSessions(): Promise<void> {
  await db.update(sessions)
    .set({ isValid: 0 })
    .where(lte(sessions.expiresAt, new Date().toISOString()));
}

