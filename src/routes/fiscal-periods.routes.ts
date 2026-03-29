// ============================================================
// FISCAL PERIODS ROUTES — /fiscal-periods
// ============================================================

import { Elysia, t } from "elysia";
import { validateSession } from "../services/session.service.ts";
import {
  openPeriod,
  closePeriod,
  lockPeriod,
  listPeriods,
  getPeriod,
} from "../services/fiscal-period.service.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";

export const fiscalPeriodsRoutes = new Elysia({ prefix: "/fiscal-periods" })

  // GET /fiscal-periods?companyId=&status=
  .get("/", async ({ query, cookie, set }) => {
    const token = (cookie["session"]?.value as string);
    if (!token || !(await validateSession(token))) { set.status = 401; return { error: "Not authenticated" }; }
    if (!(query.companyId as string)) { set.status = 400; return { error: "companyId required" }; }
    return await listPeriods((query.companyId as string), (query.status as string) as "open" | "closed" | "locked" | undefined);
  })

  // POST /fiscal-periods
  .post(
    "/",
    async ({ body, cookie, set }) => {
      const token = (cookie["session"]?.value as string);
      if (!token || !(await validateSession(token))) { set.status = 401; return { error: "Not authenticated" }; }

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
  .get("/:id", async ({ params, cookie, set }) => {
    const token = (cookie["session"]?.value as string);
    if (!token || !(await validateSession(token))) { set.status = 401; return { error: "Not authenticated" }; }
    const period = await getPeriod((params.id as string));
    if (!period) { set.status = 404; return { error: "Fiscal period not found" }; }
    return period;
  })

  // POST /fiscal-periods/:id/close
  .use(requirePermission("periods", "close"))
  .post("/:id/close", async ({ params, cookie, set }) => {
    const token = (cookie["session"]?.value as string);
    const session = token ? await validateSession(token) : null;
    if (!session) { set.status = 401; return { error: "Not authenticated" }; }

    try {
      await closePeriod((params.id as string), session.userId);
      return { message: "Fiscal period closed" };
    } catch (err) {
      set.status = 422;
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  })

  // POST /fiscal-periods/:id/lock
  .post("/:id/lock", async ({ params, cookie, set }) => {
    const token = (cookie["session"]?.value as string);
    if (!token || !(await validateSession(token))) { set.status = 401; return { error: "Not authenticated" }; }

    try {
      await lockPeriod((params.id as string));
      return { message: "Fiscal period locked permanently" };
    } catch (err) {
      set.status = 422;
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  });

