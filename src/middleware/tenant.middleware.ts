import { Elysia } from "elysia";
import { db } from "../db/connection.ts";
import { userCompanyRoles } from "../db/schema/system.schema.ts";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, authMiddleware } from "./auth.middleware.ts";

export const tenantMiddleware = (app: Elysia) => app
  .use(authMiddleware)
  .onBeforeHandle(requireAuth)
  .onBeforeHandle(async ({ user, companyId }: any) => {
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
  .derive(async ({ user, companyId }: any) => {
    if (!companyId) return { roleId: "" };
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

