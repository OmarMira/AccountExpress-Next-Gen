// ============================================================
// FISCAL PERIODS ROUTES — /fiscal-periods
// ============================================================

import { Elysia, t } from "elysia";

import {
  openPeriod,
  closePeriod,
  lockPeriod,
  listPeriods,
  getPeriod,
} from "../services/fiscal-period.service.ts";
import type { PeriodStatus } from "../services/fiscal-period.service.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { authMiddleware, requireAuth } from "../middleware/auth.middleware.ts";
import { db } from "../db/connection.ts";
import { fiscalPeriods } from "../db/schema/index.ts";
import { eq, and } from "drizzle-orm";

export const fiscalPeriodsRoutes = new Elysia({ prefix: "/fiscal-periods" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })

  // GET /fiscal-periods
  .use(requirePermission("periods", "read"))
  .get("/", async ({ query, companyId, set }) => {
    if (!companyId) { set.status = 403; return { error: 'No active company.' }; }
    return await listPeriods(companyId, query.status as PeriodStatus);
  }, {
    query: t.Object({
      status:    t.Optional(t.String()),
    }, { additionalProperties: false })
  })

  // POST /fiscal-periods
  .use(requirePermission("periods", "write"))
  .post(
    "/",
    async ({ body, companyId, set }) => {
      if (!companyId) { set.status = 403; return { error: 'No active company.' }; }
      try {
        const id = await openPeriod({
          companyId,
          name:       body.name,
          periodType: body.periodType as "monthly" | "quarterly" | "annual",
          startDate:  body.startDate,
          endDate:    body.endDate,
        });
        set.status = 201;
        return { id, message: "Fiscal period opened" };
      } catch (err) {
        set.status = 422;
        return { error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      body: t.Object({
        name:       t.String({ minLength: 1 }),
        periodType: t.Union([t.Literal("monthly"), t.Literal("quarterly"), t.Literal("annual")]),
        startDate:  t.String(),
        endDate:    t.String(),
      }, { additionalProperties: false }),
    }
  )

  // GET /fiscal-periods/:id
  .get("/:id", async ({ params, companyId, set }) => {
    if (!companyId) { set.status = 403; return { error: 'No active company.' }; }

    const [period] = await db
      .select()
      .from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.id, params.id), eq(fiscalPeriods.companyId, companyId)))
      .limit(1);

    if (!period) { set.status = 404; return { error: "Fiscal period not found" }; }
    return period;
  }, {
    params: t.Object({
      id: t.String()
    }, { additionalProperties: false })
  })

  // POST /fiscal-periods/:id/close
  .use(requirePermission("periods", "close"))
  .post("/:id/close", async ({ params, user, companyId, set }) => {
    if (!companyId) { set.status = 403; return { error: 'No active company.' }; }
    
    // Ownership check
    const [existing] = await db
      .select({ id: fiscalPeriods.id })
      .from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.id, params.id), eq(fiscalPeriods.companyId, companyId)))
      .limit(1);

    if (!existing) { set.status = 404; return { error: "Fiscal period not found" }; }

    const uid = user!;
    try {
      await closePeriod(params.id, uid);
      return { message: "Fiscal period closed" };
    } catch (err) {
      set.status = 422;
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  }, {
    params: t.Object({
      id: t.String()
    }, { additionalProperties: false })
  })

  // POST /fiscal-periods/:id/lock
  .use(requirePermission("periods", "write"))
  .post("/:id/lock", async ({ params, companyId, set }) => {
    if (!companyId) { set.status = 403; return { error: 'No active company.' }; }

    // Ownership check
    const [existing] = await db
      .select({ id: fiscalPeriods.id })
      .from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.id, params.id), eq(fiscalPeriods.companyId, companyId)))
      .limit(1);

    if (!existing) { set.status = 404; return { error: "Fiscal period not found" }; }

    try {
      await lockPeriod(params.id);
      return { message: "Fiscal period locked permanently" };
    } catch (err) {
      set.status = 422;
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  }, {
    params: t.Object({
      id: t.String()
    }, { additionalProperties: false })
  });
