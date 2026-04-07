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

  .get("/summary", async ({ query }) => {
    return await getDashboardSummary(query.companyId);
  }, {
    query: t.Object({
      companyId: t.String()
    })
  })
  
  // GET /journal?companyId=&status=&periodId=
  .get("/", async ({ query }) => {
    return await listEntries(query.companyId, {
      status:   query.status,
      periodId: query.periodId,
      limit:    query.limit  ? parseInt(query.limit)  : 100,
      offset:   query.offset ? parseInt(query.offset) : 0,
    });
  }, {
    query: t.Object({
      companyId: t.String(),
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
    async ({ body, set, user }) => {
      const uid = user!;
      try {
        const id = await createDraft(
          {
            companyId:   body.companyId,
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
      body: t.Object({
        companyId:   t.String(),
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
