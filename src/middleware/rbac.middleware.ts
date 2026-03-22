import { Elysia } from "elysia";
import { db } from "../db/connection.ts";
import { roles, permissions, rolePermissions } from "../db/schema/system.schema.ts";
import { eq, and } from "drizzle-orm";
import { tenantMiddleware } from "./tenant.middleware.ts";

export const requirePermission = (moduleName: string, actionName: string) => (app: Elysia) => app
  .use(tenantMiddleware)
  .onBeforeHandle(async ({ roleId }) => {
    const role = await db.query.roles.findFirst({
      where: eq(roles.id, roleId)
    });

    if (!role || role.isActive === 0) {
      return new Response(JSON.stringify({ error: "Role invalid or inactive" }), { status: 403 });
    }

    const targetPermission = await db.query.permissions.findFirst({
      where: and(
        eq(permissions.module, moduleName),
        eq(permissions.action, actionName)
      )
    });

    if (!targetPermission) {
      return new Response(JSON.stringify({ error: `${moduleName}:${actionName} permission not found` }), { status: 403 });
    }

    const hasPerm = await db.query.rolePermissions.findFirst({
      where: and(
        eq(rolePermissions.roleId, roleId),
        eq(rolePermissions.permissionId, targetPermission.id)
      )
    });

    if (!hasPerm) {
      return new Response(JSON.stringify({ error: `${moduleName}:${actionName} denied` }), { status: 403 });
    }
  });
