import { Elysia } from "elysia";
import { db } from "../db/connection.ts";
import { userCompanyRoles } from "../db/schema/system.schema.ts";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, authMiddleware } from "./auth.middleware.ts";

interface TenantContext {
  user: string | null;
  companyId: string | null;
}


export const tenantMiddleware = (app: Elysia) => app
  .use(authMiddleware)
  .onBeforeHandle(requireAuth)
  .onBeforeHandle(async ({ user, companyId }: TenantContext) => {
    if (!user) {
      return new Response(JSON.stringify({ error: "No authenticated user in session" }), { status: 401 });
    }

    // ── SUPER ADMIN BYPASS: check FIRST, before companyId validation ──
    const { users } = await import("../db/schema/system.schema.ts");
    const [dbUser] = await db.select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, user))
      .limit(1);

    if (dbUser?.isSuperAdmin) {
      // Super admin can proceed without companyId
      return;
    }

    // ── NORMAL USER: companyId is required ──
    if (!companyId) {
      return new Response(JSON.stringify({ error: "No active company in session" }), { status: 403 });
    }

    const membership = await db.query.userCompanyRoles.findFirst({
      where: and(
        eq(userCompanyRoles.userId, user),
        eq(userCompanyRoles.companyId, companyId),
        eq(userCompanyRoles.isActive, true),
        isNull(userCompanyRoles.revokedAt)
      )
    });

    if (!membership) {
      return new Response(JSON.stringify({ error: "User not in this company" }), { status: 403 });
    }
  })
  .derive(async ({ user, companyId }: TenantContext) => {
    if (!companyId) return { roleId: "" };
    if (!user) return { roleId: "" };
    const membership = await db.query.userCompanyRoles.findFirst({
      where: and(
        eq(userCompanyRoles.userId, user),
        eq(userCompanyRoles.companyId, companyId),
        eq(userCompanyRoles.isActive, true),
        isNull(userCompanyRoles.revokedAt)
      )
    });
    return {
      roleId: membership?.roleId || ""
    };
  });

