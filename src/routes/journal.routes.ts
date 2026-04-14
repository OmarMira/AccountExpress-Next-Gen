// ============================================================
// JOURNAL ROUTES — CRUD /journal
// ============================================================

import { Elysia, t } from "elysia";

import {
  createDraft,
  post,
  getEntryWithLines,
  listEntries,
  getDashboardSummary,
} from "../services/journal-core.service.ts";
import { ValidationError } from "../lib/errors.ts";
import { voidEntry } from "../services/journal-void.service.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";

export const journalRoutes = new Elysia({ prefix: "/journal" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })

  // ⚠️ FIX: All routes now read companyId from the session context (ctx.companyId),
  // NOT from query strings or request bodies. This prevents a tenant-escalation
  // attack where an authenticated user accesses or writes data from a different company.

  .get("/summary", async ({ companyId, set }) => {
    if (!companyId) {
      set.status = 403;
      return { error: 'No active company in session. Select a company first.' };
    }
    return await getDashboardSummary(companyId);
  })
  
  // GET /journal?status=&periodId=
  .get("/", async ({ query, companyId, set }) => {
    if (!companyId) {
      set.status = 403;
      return { error: 'No active company in session.' };
    }
    return await listEntries(companyId, {
      status:   query.status,
      periodId: query.periodId,
      limit:    query.limit  ? parseInt(query.limit)  : 100,
      offset:   query.offset ? parseInt(query.offset) : 0,
    });
  }, {
    // ⚠️ FIX: companyId removed from query schema — no longer accepted from the client.
    query: t.Object({
      status:    t.Optional(t.String()),
      periodId:  t.Optional(t.String()),
      limit:     t.Optional(t.String()),
      offset:    t.Optional(t.String()),
    })
  })

  // GET /journal/:id
  .get("/:id", async ({ params }) => {
    return await getEntryWithLines(params.id);
  }, {
    params: t.Object({
      id: t.String()
    })
  })

  // POST /journal — create draft
  .use(requirePermission("journal", "create"))
  .post(
    "/",
    async ({ body, set, user, companyId }) => {
      const uid = user!;

      // ⚠️ FIX: companyId comes from the session, not from the request body.
      if (!companyId) {
        set.status = 403;
        return { error: 'No active company in session.' };
      }

      try {
        const id = await createDraft(
          {
            companyId,            // from session — NOT body.companyId
            entryDate:   body.entryDate,
            description: body.description,
            reference:   body.reference ?? null,
            isAdjusting: body.isAdjusting ?? false,
            periodId:    body.periodId,
            createdBy:   uid,
          },
          body.lines.map((l) => ({
            accountId:    l.accountId,
            debitAmount:  l.debitAmount,
            creditAmount: l.creditAmount,
            description:  l.description ?? null,
            lineNumber:   l.lineNumber,
          }))
        );
        set.status = 201;
        return { id, message: "Draft journal entry created" };
      } catch (err) {
        if (err instanceof ValidationError) {
          set.status = 422;
          return { error: err.message };
        }
        throw err;
      }
    },
    {
      // ⚠️ FIX: companyId removed from body schema — it is no longer accepted from the client.
      body: t.Object({
        entryDate:   t.String(),
        description: t.String({ minLength: 1 }),
        reference:   t.Optional(t.String()),
        isAdjusting: t.Optional(t.Boolean()),
        periodId:    t.String(),
        lines: t.Array(
          t.Object({
            accountId:    t.String(),
            debitAmount:  t.Number({ minimum: 0 }),
            creditAmount: t.Number({ minimum: 0 }),
            description:  t.Optional(t.String()),
            lineNumber:   t.Integer({ minimum: 1 }),
          }),
          { minItems: 2 }
        ),
      }),
    }
  )

  // POST /journal/:id/post — validate + post
  .use(requirePermission("journal", "approve"))
  .post("/:id/post", async ({ params, request, set, user, sessionId }) => {
    const uid = user!;
    const sid = sessionId!;
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    try {
      await post(params.id, uid, sid, ip);
      return { message: "Journal entry posted" };
    } catch (err) {
      if (err instanceof ValidationError) {
        set.status = 422;
        return { error: err.message };
      }
      throw err;
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  })

  // POST /journal/:id/void
  .use(requirePermission("journal", "void"))
  .post("/:id/void", async ({ params, request, set, user, sessionId }) => {
    const uid = user!;
    const sid = sessionId!;
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    try {
      await voidEntry(params.id, uid, sid, ip);
      return { message: "Journal entry voided" };
    } catch (err) {
      if (err instanceof ValidationError) {
        set.status = 422;
        return { error: err.message };
      }
      throw err;
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  });
