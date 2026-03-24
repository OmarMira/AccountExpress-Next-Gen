import { db } from "../../db/connection.ts";
import { users } from "../../db/schema/system.schema.ts";
import { eq } from "drizzle-orm";
import { verifyPassword } from "./password.service.ts";
import { createSession } from "./session.service.ts";

export interface LoginResult {
  success: boolean;
  sessionId?: string;
  error?: "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" | "ACCOUNT_DISABLED";
  lockedUntil?: Date;
}

// Dummy hash matching cost 12 size precisely to mitigate timing attacks
const DUMMY_HASH = "$2a$12$DUMMYHASHDUMMYHASHDUMMYHASHDUMMYHASHDUMMYHASHDUMMYHASH";

export async function login(username: string, plain: string, ipAddress: string, userAgent?: string): Promise<LoginResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.username, username)
  });

  if (!user) {
    // Timing attack mitigation: always execute bcrypt compare
    await verifyPassword(plain, DUMMY_HASH);
    return { success: false, error: "INVALID_CREDENTIALS" };
  }

  if (user.isActive === 0) {
    return { success: false, error: "ACCOUNT_DISABLED" };
  }

  if (user.isLocked === 1) {
    const lockedUntil = user.lockedUntil ? new Date(user.lockedUntil) : new Date();
    if (lockedUntil > new Date()) {
      return { success: false, error: "ACCOUNT_LOCKED", lockedUntil };
    } else {
      // Lock expired, reset
      await db.update(users).set({ isLocked: 0, lockedUntil: null, failedAttempts: 0 }).where(eq(users.id, user.id));
    }
  }

  const isValid = await verifyPassword(plain, user.passwordHash);

  if (!isValid) {
    const newFailures = user.failedAttempts + 1;
    if (newFailures >= 5) {
      const lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
      await db.update(users).set({ 
        isLocked: 1, 
        failedAttempts: newFailures, 
        lockedUntil: lockUntil.toISOString() 
      }).where(eq(users.id, user.id));
    } else {
      await db.update(users).set({ failedAttempts: newFailures }).where(eq(users.id, user.id));
    }
    return { success: false, error: "INVALID_CREDENTIALS" };
  }

  // Success flow
  await db.update(users).set({
    failedAttempts: 0,
    isLocked: 0,
    lockedUntil: null,
    lastLoginAt: new Date().toISOString(),
    lastLoginIp: ipAddress
  }).where(eq(users.id, user.id));

  const sessionId = await createSession({
    userId: user.id,
    ipAddress,
    userAgent
  });

  return { success: true, sessionId };
}

