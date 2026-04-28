import { Elysia, t } from "elysia";
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { createGroup, reconcileGroup } from "../services/bank/reconciliation-group.service.ts";
import { logger } from "../lib/logger.ts";
import { db } from "../db/connection.ts";
import { eq } from "drizzle-orm";
import { bankTransactionGroups } from "../db/schema/index.ts";

export const reconciliationGroupRoutes = new Elysia({ prefix: "/bank/groups" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })
  .use(requirePermission("bank", "approve"))
  
  // 1. POST /bank/groups
  .post(
    "/",
    async ({ body, companyId, set }) => {
      if (!companyId) {
        set.status = 403;
        return { error: 'No active company in session.' };
      }

      try {
        const result = await createGroup({
          companyId: companyId,
          description: body.description,
          transactionIds: body.transactionIds,
          glAccountId: body.glAccountId
        });
        set.status = 201;
        return result;
      } catch (err) {
        logger.error("reconciliation-group.routes", "Error creating group", err);
        set.status = 400;
        const message = err instanceof Error ? err.message : "Unknown error creating group";
        return { error: message };
      }
    },
    {
      body: t.Object({
        description: t.String(),
        transactionIds: t.Array(t.String()),
        glAccountId: t.String(),
      }, { additionalProperties: false }),
    }
  )

  // 2. POST /bank/groups/:groupId/reconcile
  .post(
    "/:groupId/reconcile",
    async ({ params, body, companyId, request, set, user, sessionId }) => {
      if (!companyId) {
        set.status = 403;
        return { error: 'No active company in session.' };
      }

      const [existing] = await db
        .select({ companyId: bankTransactionGroups.companyId })
        .from(bankTransactionGroups)
        .where(eq(bankTransactionGroups.id, params.groupId))
        .limit(1);

      if (!existing || existing.companyId !== companyId) {
        set.status = 403;
        return { success: false, error: 'Acceso denegado' };
      }

      const uid = user!;
      const sid = sessionId!;
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";

      try {
        const result = await reconcileGroup({
          groupId: params.groupId,
          companyId: companyId,
          periodId: body.periodId,
          userId: uid,
          sessionId: sid,
          ipAddress: ip,
          bankAccountGlId: body.bankAccountGlId
        });
        
        set.status = 200;
        return result;
      } catch (err) {
        logger.error("reconciliation-group.routes", "Error reconciling group", err);
        set.status = 400;
        const message = err instanceof Error ? err.message : "Unknown error reconciling group";
        return { error: message };
      }
    },
    {
      params: t.Object({
        groupId: t.String()
      }, { additionalProperties: false }),
      body: t.Object({
        periodId: t.String(),
        bankAccountGlId: t.String()
      }, { additionalProperties: false })
    }
  );
