import { Elysia } from "elysia";
import { db } from "../db/connection.ts";
import { sessions } from "../db/schema/system.schema.ts";
import { eq, and } from "drizzle-orm";

export const authMiddleware = (app: Elysia) => app
  .onBeforeHandle(async ({ cookie, set }) => {
    const sessionId = cookie.session?.value ? String(cookie.session.value) : "";
    if (!sessionId) {
      set.status = 401;
      return { error: "No session" };
    }
    const dbSession = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.isValid, true))
    });
    if (!dbSession) {
      set.status = 401;
      return { error: "Invalid session" };
    }
    if (new Date(dbSession.expiresAt) < new Date()) {
      await db.update(sessions).set({ isValid: false }).where(eq(sessions.id, sessionId));
      set.status = 401;
      return { error: "Session expired" };
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    await db.update(sessions)
      .set({ lastActiveAt: now, expiresAt: expiresAt })
      .where(eq(sessions.id, sessionId));
  })
  .derive(async ({ cookie }) => {
    const sessionId = cookie.session?.value ? String(cookie.session.value) : "";
    if (!sessionId) return { user: "", companyId: null, sessionId: "" };
    const dbSession = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.isValid, true))
    });
    return {
      user: dbSession?.userId || "",
      companyId: dbSession?.companyId || null,
      sessionId
    };
  });

