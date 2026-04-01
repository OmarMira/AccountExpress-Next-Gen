import { Elysia } from "elysia";
import { db } from "../db/connection.ts";
import { sessions } from "../db/schema/system.schema.ts";
import { eq, and } from "drizzle-orm";

// 1. Only injects data (always proceeds)
export const authMiddleware = new Elysia({ name: "auth-data" })
  .derive({ as: "global" }, async ({ cookie }) => {
    const sessionId = cookie.session?.value ? String(cookie.session.value) : "";
    if (!sessionId) return { user: "", companyId: null, sessionId: "" };

    const dbSession = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.isValid, true))
    });

    if (!dbSession) return { user: "", companyId: null, sessionId: "" };

    if (new Date(dbSession.expiresAt) < new Date()) {
      await db.update(sessions).set({ isValid: false }).where(eq(sessions.id, sessionId));
      return { user: "", companyId: null, sessionId: "" };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    await db.update(sessions)
      .set({ lastActiveAt: now, expiresAt: expiresAt })
      .where(eq(sessions.id, sessionId));

    return {
      user: dbSession.userId,
      companyId: dbSession.companyId ?? null,
      sessionId
    };
  });

// 2. Blocks if not user (strict)
export const isAuthenticated = new Elysia({ name: "auth-guard" })
  .use(authMiddleware)
  .onBeforeHandle({ as: "scoped" }, ({ user, set }: any) => {
    if (!user) {
      set.status = 401;
      return { error: "Not authenticated" };
    }
  });
