import { Elysia } from "elysia";
import { db } from "../db/connection.ts";
import { sessions } from "../db/schema/system.schema.ts";
import { eq, and } from "drizzle-orm";

export const authMiddleware = (app: Elysia) => app
  .onBeforeHandle(async ({ cookie: { session } }) => {
    const sessionId = (session?.value as string) || "";
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "No session" }), { status: 401 });
    }

    const dbSession = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.isValid, 1))
    });

    if (!dbSession) {
      return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401 });
    }

    if (new Date(dbSession.expiresAt) < new Date()) {
      await db.update(sessions).set({ isValid: 0 }).where(eq(sessions.id, sessionId));
      return new Response(JSON.stringify({ error: "Session expired" }), { status: 401 });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    await db.update(sessions)
      .set({ lastActiveAt: now.toISOString(), expiresAt: expiresAt.toISOString() })
      .where(eq(sessions.id, sessionId));
  })
  .derive(async ({ cookie: { session } }) => {
    const sessionId = (session?.value as string) || "";
    if (!sessionId) return { user: "", companyId: null, sessionId: "" };

    const dbSession = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.isValid, 1))
    });

    return {
      user: dbSession?.userId || "",
      companyId: dbSession?.companyId || null,
      sessionId
    };
  });
