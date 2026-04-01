// ============================================================
// AUTH ROUTES — POST /auth/login, /logout, /change-password
// PostgreSQL 16 / Drizzle ORM refactor
// ============================================================

import { Elysia, t } from "elysia";
import { db, sql } from "../db/connection.ts";
import { users, sessions, companies, userCompanyRoles } from "../db/schema/index.ts";
import { eq, and, or, isNull } from "drizzle-orm";
import {
  verifyPassword,
  recordFailedAttempt,
  resetFailedAttempts,
  isAccountLocked,
  updateLastLogin,
  hashPassword,
  DUMMY_HASH,
} from "../services/auth.service.ts";
import {
  createSession,
  invalidateSession,
  switchSessionCompany,
  invalidateAllUserSessions,
  listActiveSessions,
} from "../services/session.service.ts";
import { createAuditEntry } from "../services/audit.service.ts";
import { loginRateLimiter } from "../middleware/rate-limit.ts";
import { authMiddleware } from "../middleware/auth.middleware.ts";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(authMiddleware)

  // ── POST /auth/login ──────────────────────────────────────
  .post(
    "/login",
    async ({ body, cookie, request, set }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const ua = request.headers.get("user-agent") ?? null;

      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          passwordHash: users.passwordHash,
          isActive: users.isActive,
          isSuperAdmin: users.isSuperAdmin,
        })
        .from(users)
        .where(
          or(
            eq(users.username, body.username),
            eq(users.email, body.username)
          )
        )
        .limit(1);

      if (!user) {
        await verifyPassword(body.password, DUMMY_HASH);
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      if (!user.isActive) {
        set.status = 403;
        return { error: "Account is deactivated" };
      }

      const lockStatus = await isAccountLocked(user.id);
      if (lockStatus.locked) {
        set.status = 423;
        return { error: `Account locked until ${lockStatus.until}` };
      }

      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) {
        await recordFailedAttempt(user.id);
        await createAuditEntry({
          companyId: null, userId: user.id, sessionId: null,
          action: "users:read", module: "users",
          entityType: "login_attempt", entityId: user.id,
          beforeState: null, afterState: { result: "failed" }, ipAddress: ip,
        });
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      await resetFailedAttempts(user.id);
      await updateLastLogin(user.id, ip);

      const companyId = null;
      const sessionId = await createSession({ userId: user.id, companyId, ipAddress: ip, userAgent: ua });

      await createAuditEntry({
        companyId, userId: user.id, sessionId,
        action: "users:read", module: "users",
        entityType: "session", entityId: sessionId,
        beforeState: null, afterState: { result: "login_success" }, ipAddress: ip,
      });

      cookie["session"].set({
        value: sessionId,
        httpOnly: true,
        sameSite: "strict",
        secure: process.env["NODE_ENV"] === "production",
        path: "/",
        maxAge: 8 * 60 * 60, // 8 hours
      });

      // Fetch Full User Profile
      const [fullUser] = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          isSuperAdmin: users.isSuperAdmin
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      
      // Fetch Available Companies
      let comps = [];
      if (user.isSuperAdmin) {
        comps = await db
          .select({ id: companies.id, legalName: companies.legalName })
          .from(companies)
          .where(eq(companies.isActive, true));
      } else {
        comps = await db
          .select({ id: companies.id, legalName: companies.legalName })
          .from(companies)
          .innerJoin(userCompanyRoles, eq(companies.id, userCompanyRoles.companyId))
          .where(
            and(
              eq(userCompanyRoles.userId, user.id),
              eq(companies.isActive, true),
              eq(userCompanyRoles.isActive, true),
              isNull(userCompanyRoles.revokedAt)
            )
          );
      }

      return { 
        message: "Login successful", 
        sessionId,
        user: fullUser,
        companies: comps 
      };
    },
    {
      beforeHandle: loginRateLimiter(5, 15 * 60 * 1000), // 5 attempts per 15 mins
      body: t.Object({
        username:  t.String({ minLength: 1 }),
        password:  t.String({ minLength: 1 }),
      }),
    }
  )

  // ── POST /auth/select-company ─────────────────────────────
  .post(
    "/select-company",
    async ({ body, user, sessionId, request, set }) => {
      if (!user) { set.status = 401; return { error: "Not authenticated" }; }
      
      const [session] = await db
        .select({ companyId: sessions.companyId })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (!session) { set.status = 401; return { error: "Invalid session" }; }
      if (session.companyId) { set.status = 400; return { error: "Company already selected. Use /switch-company instead." }; }

      const [role] = await db
        .select({ id: userCompanyRoles.id })
        .from(userCompanyRoles)
        .where(
          and(
            eq(userCompanyRoles.userId, user),
            eq(userCompanyRoles.companyId, body.companyId),
            eq(userCompanyRoles.isActive, true),
            isNull(userCompanyRoles.revokedAt)
          )
        )
        .limit(1);

      if (!role) {
        const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, user)).limit(1);
        if (!dbUser || !dbUser.isSuperAdmin) {
          set.status = 403; return { error: "Access denied to this company" };
        }
      }

      await switchSessionCompany(sessionId, body.companyId);

      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      await createAuditEntry({
        companyId: body.companyId, userId: user, sessionId,
        action: "session:select_company", module: "auth",
        entityType: "session", entityId: sessionId,
        beforeState: null, afterState: { result: "company_selected", companyId: body.companyId }, ipAddress: ip,
      });

      return { message: "Company selected successfully" };
    },
    { body: t.Object({ companyId: t.String() }) }
  )

  // ── POST /auth/switch-company ─────────────────────────────
  .post(
    "/switch-company",
    async ({ body, user, sessionId, request, set }) => {
      if (!user) { set.status = 401; return { error: "Not authenticated" }; }
      
      const [role] = await db
        .select({ id: userCompanyRoles.id })
        .from(userCompanyRoles)
        .where(
          and(
            eq(userCompanyRoles.userId, user),
            eq(userCompanyRoles.companyId, body.companyId),
            eq(userCompanyRoles.isActive, true),
            isNull(userCompanyRoles.revokedAt)
          )
        )
        .limit(1);

      if (!role) {
        const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, user)).limit(1);
        if (!dbUser || !dbUser.isSuperAdmin) {
          set.status = 403; return { error: "Access denied to this company" };
        }
      }

      await switchSessionCompany(sessionId, body.companyId);

      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      await createAuditEntry({
        companyId: body.companyId, userId: user, sessionId,
        action: "session:switch_company", module: "auth",
        entityType: "session", entityId: sessionId,
        beforeState: null, afterState: { result: "company_switched", companyId: body.companyId }, ipAddress: ip,
      });

      return { message: "Company switched successfully" };
    },
    { body: t.Object({ companyId: t.String() }) }
  )

  // ── POST /auth/logout ─────────────────────────────────────
  .post("/logout", async ({ cookie }) => {
    const token = (cookie["session"].value as string);
    if (token) {
      await invalidateSession(token);
      cookie["session"].remove();
    }
    return { message: "Logged out" };
  })

  // ── POST /auth/logout-all — revoke all sessions ───────────
  .post("/logout-all", async ({ user, sessionId, set, cookie }) => {
    if (!user) { set.status = 401; return { error: "Not authenticated" }; }
    const count = await invalidateAllUserSessions(user);
    cookie["session"].remove();
    return { success: true, message: `${count} session(s) revoked.` };
  })

  // ── GET /auth/sessions — list active sessions ─────────────
  .get("/sessions", async ({ user, sessionId, set }) => {
    if (!user) { set.status = 401; return { error: "Not authenticated" }; }
    const activeSessions = await listActiveSessions(user);
    return { success: true, data: activeSessions };
  })

  // ── POST /auth/change-password ────────────────────────────
  .post(
    "/change-password",
    async ({ body, user, set }) => {
      if (!user) { set.status = 401; return { error: "Not authenticated" }; }

      const [dbUser] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, user))
        .limit(1);

      if (!dbUser) { set.status = 404; return { error: "User not found" }; }

      const valid = await verifyPassword(body.currentPassword, dbUser.passwordHash);
      if (!valid) { set.status = 401; return { error: "Current password is incorrect" }; }

      const { hash: newHash, salt: newSalt } = await hashPassword(body.newPassword);

      await db.update(users)
        .set({
          passwordHash: newHash,
          passwordSalt: newSalt,
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user));

      return { message: "Password changed successfully" };
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword:     t.String({ minLength: 8 }),
      }),
    }
  );
