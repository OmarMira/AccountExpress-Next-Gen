import { Elysia } from "elysia";
import { db } from "../db/connection.ts";
import { sessions } from "../db/schema/system.schema.ts";
import { eq, and } from "drizzle-orm";

export const authMiddleware = new Elysia({ name: "auth-middleware" })
  .derive({ as: "scoped" }, async ({ cookie }) => {
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
  })
  .onBeforeHandle({ as: "scoped" }, (context: any) => {
    if (!context.user) {
      context.set.status = 401;
      return { error: "Not authenticated" };
    }
  });
