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
import { requireAuth } from "../middleware/auth.middleware.ts";

export const fiscalPeriodsRoutes = new Elysia({ prefix: "/fiscal-periods" })
  .guard({ beforeHandle: requireAuth })

  // GET /fiscal-periods?companyId=&status=
  .get("/", async ({ query }) => {
    return await listPeriods(query.companyId, query.status as PeriodStatus);
  }, {
    query: t.Object({
      companyId: t.String(),
      status:    t.Optional(t.String()),
    })
  })

  // POST /fiscal-periods
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const id = await openPeriod({
          companyId:  body.companyId,
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
        companyId:  t.String(),
        name:       t.String({ minLength: 1 }),
        periodType: t.Union([t.Literal("monthly"), t.Literal("quarterly"), t.Literal("annual")]),
        startDate:  t.String(),
        endDate:    t.String(),
      }),
    }
  )

  // GET /fiscal-periods/:id
  .get("/:id", async ({ params, set }) => {
    const period = await getPeriod(params.id);
    if (!period) { set.status = 404; return { error: "Fiscal period not found" }; }
    return period;
  }, {
    params: t.Object({
      id: t.String()
    })
  })

  // POST /fiscal-periods/:id/close
  .use(requirePermission("periods", "close"))
  .post("/:id/close", async ({ params, user, set }) => {
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
    })
  })

  // POST /fiscal-periods/:id/lock
  .post("/:id/lock", async ({ params, set }) => {
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
    })
  });
