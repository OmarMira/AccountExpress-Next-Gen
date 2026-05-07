import { Elysia } from "elysia";
import { db } from "../db/connection.ts";
import { sessions } from "../db/schema/index.ts";
import { eq, and } from "drizzle-orm";

export const authMiddleware = new Elysia({ name: "auth" })
  .derive({ as: 'scoped' }, async ({ cookie: { session }, set }) => {
    const sessionId = session?.value;
    
    if (!sessionId) {
      return { user: null, companyId: null, sessionId: null };
    }

    const [dbSession] = await db
      .select({
        userId: sessions.userId,
        companyId: sessions.companyId,
        isValid: sessions.isValid,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!dbSession || !dbSession.isValid || new Date() > dbSession.expiresAt) {
      return { user: null, companyId: null, sessionId: null };
    }

    return {
      user: dbSession.userId,
      companyId: dbSession.companyId,
      sessionId
    };
  });

export const requireAuth = ({ user, set }: { user: string | null; set: any }) => {
  if (!user) {
    set.status = 401;
    return { error: "Unauthorized" };
  }
};
