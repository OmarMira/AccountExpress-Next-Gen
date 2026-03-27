// ============================================================
// AUTH ROUTES — POST /auth/login, /logout, /change-password
// ============================================================

import { Elysia, t } from "elysia";
import { rawDb } from "../db/connection.ts";
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
  validateSession,
  invalidateSession,
} from "../services/session.service.ts";
import { createAuditEntry } from "../services/audit.service.ts";

export const authRoutes = new Elysia({ prefix: "/auth" })

  // ── POST /auth/login ──────────────────────────────────────
  .post(
    "/login",
    async ({ body, cookie, request, set }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const ua = request.headers.get("user-agent") ?? null;

      const user = rawDb
        .query(
          "SELECT id, username, password_hash, is_active, is_super_admin FROM users WHERE username = ? OR email = ?"
        )
        .get(body.username, body.username) as {
          id: string;
          username: string;
          password_hash: string;
          is_active: number;
          is_super_admin: number;
        } | null;

      if (!user) {
        await verifyPassword(body.password, DUMMY_HASH);
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      if (!user.is_active) {
        set.status = 403;
        return { error: "Account is deactivated" };
      }

      const lockStatus = isAccountLocked(user.id);
      if (lockStatus.locked) {
        set.status = 423;
        return { error: `Account locked until ${lockStatus.until}` };
      }

      const valid = await verifyPassword(body.password, user.password_hash);
      if (!valid) {
        recordFailedAttempt(user.id);
        createAuditEntry({
          companyId: null, userId: user.id, sessionId: null,
          action: "users:read", module: "users",
          entityType: "login_attempt", entityId: user.id,
          beforeState: null, afterState: { result: "failed" }, ipAddress: ip,
        });
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      resetFailedAttempts(user.id);
      updateLastLogin(user.id, ip);

      const companyId = null;
      const sessionId = createSession({ userId: user.id, companyId, ipAddress: ip, userAgent: ua });

      createAuditEntry({
        companyId, userId: user.id, sessionId,
        action: "users:read", module: "users",
        entityType: "session", entityId: sessionId,
        beforeState: null, afterState: { result: "login_success" }, ipAddress: ip,
      });

      cookie["session"].set({
        value: sessionId,
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 60 * 60, // 8 hours
      });

      // Fetch Full User Profile
      const fullUser = rawDb.query("SELECT id, username, email, first_name as firstName, last_name as lastName, is_super_admin as isSuperAdmin FROM users WHERE id = ?").get(user.id) as any;
      
      // Fetch Available Companies
      let comps = [];
      if (user.is_super_admin === 1) {
        comps = rawDb.query("SELECT id, legal_name as legalName FROM companies WHERE is_active = 1").all();
      } else {
        comps = rawDb.query(`
          SELECT c.id, c.legal_name as legalName 
          FROM companies c
          JOIN user_company_roles ucr ON c.id = ucr.company_id
          WHERE ucr.user_id = ? AND c.is_active = 1 AND ucr.is_active = 1 AND ucr.revoked_at IS NULL
        `).all(user.id);
      }

      return { 
        message: "Login successful", 
        sessionId,
        user: { 
          ...fullUser, 
          isSuperAdmin: fullUser.isSuperAdmin === 1
        },
        companies: comps 
      };
    },
    {
      body: t.Object({
        username:  t.String({ minLength: 1 }),
        password:  t.String({ minLength: 1 }),
      }),
    }
  )

  // ── POST /auth/bypass (DEV ONLY) ─────────────────────────
  .post(
    "/bypass",
    async ({ cookie, request, set }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      const ua = request.headers.get("user-agent") ?? null;
      const user = rawDb.query("SELECT id, username, is_active, is_super_admin FROM users WHERE username = 'admin' LIMIT 1").get() as any;
      if (!user) {
        set.status = 500;
        return { error: "Admin user not found" };
      }
      const sessionId = createSession({ userId: user.id, companyId: null, ipAddress: ip, userAgent: ua });
      cookie["session"].set({ value: sessionId, httpOnly: true, sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 });
      const fullUser = rawDb.query("SELECT id, username, email, first_name as firstName, last_name as lastName, is_super_admin as isSuperAdmin FROM users WHERE id = ?").get(user.id) as any;
      const comps = rawDb.query("SELECT id, legal_name as legalName FROM companies WHERE is_active = 1").all();
      return { 
        message: "Login successful (BYPASS)", 
        sessionId,
        user: { ...fullUser, isSuperAdmin: true },
        companies: comps 
      };
    }
  )

  // ── POST /auth/select-company ─────────────────────────────
  .post(
    "/select-company",
    async ({ body, cookie, request, set }) => {
      const token = (cookie["session"].value as string);
      if (!token) { set.status = 401; return { error: "Not authenticated" }; }
      
      const session = rawDb.query("SELECT * FROM sessions WHERE id = ? AND is_valid = 1").get(token) as any;
      if (!session) { set.status = 401; return { error: "Invalid session" }; }
      if (session.company_id) { set.status = 400; return { error: "Company already selected. Use /switch-company instead." }; }

      const role = rawDb.query("SELECT * FROM user_company_roles WHERE user_id = ? AND company_id = ? AND is_active = 1 AND revoked_at IS NULL").get(session.user_id, body.companyId);
      if (!role) {
        const user = rawDb.query("SELECT is_super_admin FROM users WHERE id = ?").get(session.user_id) as any;
        if (!user || user.is_super_admin !== 1) {
          set.status = 403; return { error: "Access denied to this company" };
        }
      }

      const { switchSessionCompany } = await import("../services/session.service.ts");
      switchSessionCompany(token, body.companyId);

      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      createAuditEntry({
        companyId: body.companyId, userId: session.user_id, sessionId: token,
        action: "session:select_company", module: "auth",
        entityType: "session", entityId: token,
        beforeState: null, afterState: { result: "company_selected", companyId: body.companyId }, ipAddress: ip,
      });

      return { message: "Company selected successfully" };
    },
    { body: t.Object({ companyId: t.String() }) }
  )

  // ── POST /auth/switch-company ─────────────────────────────
  .post(
    "/switch-company",
    async ({ body, cookie, request, set }) => {
      const token = (cookie["session"].value as string);
      if (!token) { set.status = 401; return { error: "Not authenticated" }; }
      
      const session = rawDb.query("SELECT * FROM sessions WHERE id = ? AND is_valid = 1").get(token) as any;
      if (!session) { set.status = 401; return { error: "Invalid session" }; }

      const role = rawDb.query("SELECT * FROM user_company_roles WHERE user_id = ? AND company_id = ? AND is_active = 1 AND revoked_at IS NULL").get(session.user_id, body.companyId);
      if (!role) {
        const user = rawDb.query("SELECT is_super_admin FROM users WHERE id = ?").get(session.user_id) as any;
        if (!user || user.is_super_admin !== 1) {
          set.status = 403; return { error: "Access denied to this company" };
        }
      }

      const { switchSessionCompany } = await import("../services/session.service.ts");
      switchSessionCompany(token, body.companyId);

      const ip = request.headers.get("x-forwarded-for") ?? "unknown";
      createAuditEntry({
        companyId: body.companyId, userId: session.user_id, sessionId: token,
        action: "session:switch_company", module: "auth",
        entityType: "session", entityId: token,
        beforeState: { companyId: session.company_id }, afterState: { result: "company_switched", companyId: body.companyId }, ipAddress: ip,
      });

      return { message: "Company switched successfully" };
    },
    { body: t.Object({ companyId: t.String() }) }
  )

  // ── POST /auth/logout ─────────────────────────────────────
  .post("/logout", ({ cookie, set }) => {
    const token = (cookie["session"].value as string);
    if (token) {
      invalidateSession(token);
      cookie["session"].remove();
    }
    return { message: "Logged out" };
  })

  // ── POST /auth/change-password ────────────────────────────
  .post(
    "/change-password",
    async ({ body, cookie, set }) => {
      const token = (cookie["session"].value as string);
      if (!token) { set.status = 401; return { error: "Not authenticated" }; }

      const { hashPassword: hash } = await import("../services/auth.service.ts");
      const { hash: newHash, salt: newSalt } = await hashPassword(body.newPassword);

      rawDb
        .prepare(
          `UPDATE users SET
             password_hash        = ?,
             password_salt        = ?,
             must_change_password = 0,
             updated_at           = ?
           WHERE id = (SELECT user_id FROM sessions WHERE id = ? AND is_valid = 1)`
        )
        .run(newHash, newSalt, new Date().toISOString(), token);

      return { message: "Password changed successfully" };
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword:     t.String({ minLength: 8 }),
      }),
    }
  );

