import { Elysia, t } from "elysia";
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { createGroup, reconcileGroup } from "../services/bank/reconciliation-group.service.ts";
import { logger } from "../lib/logger.ts";

export const reconciliationGroupRoutes = new Elysia({ prefix: "/bank/groups" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })
  .use(requirePermission("bank", "approve"))
  
  // 1. POST /bank/groups
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const result = await createGroup({
          companyId: body.companyId,
          description: body.description,
          transactionIds: body.transactionIds,
          glAccountId: body.glAccountId
        });
        set.status = 201;
        return result;
      } catch (err: any) {
        logger.error("reconciliation-group.routes", "Error creating group", err);
        set.status = 400;
        return { error: err.message || "Unknown error creating group" };
      }
    },
    {
      body: t.Object({
        companyId: t.String(),
        description: t.String(),
        transactionIds: t.Array(t.String()),
        glAccountId: t.String(),
      }),
    }
  )

  // 2. POST /bank/groups/:groupId/reconcile
  .post(
    "/:groupId/reconcile",
    async ({ params, body, request, set, user, sessionId }) => {
      const uid = user!;
      const sid = sessionId!;
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";

      try {
        const result = await reconcileGroup({
          groupId: params.groupId,
          companyId: body.companyId,
          periodId: body.periodId,
          userId: uid,
          sessionId: sid,
          ipAddress: ip,
          bankAccountGlId: body.bankAccountGlId
        });
        
        set.status = 200;
        return result;
      } catch (err: any) {
        logger.error("reconciliation-group.routes", "Error reconciling group", err);
        set.status = 400;
        return { error: err.message || "Unknown error reconciling group" };
      }
    },
    {
      params: t.Object({
        groupId: t.String()
      }),
      body: t.Object({
        companyId: t.String(),
        periodId: t.String(),
        bankAccountGlId: t.String()
      })
    }
  );
