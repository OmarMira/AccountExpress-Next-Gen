// ============================================================
// JOURNAL ROUTES — CRUD /journal
// ============================================================

import { Elysia, t } from "elysia";
import { validateSession } from "../services/session.service.ts";
import {
  createDraft,
  post,
  getEntryWithLines,
  listEntries,
  ValidationError,
} from "../services/journal.service.ts";
import { voidEntry } from "../services/journal-void.service.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";

export const journalRoutes = new Elysia({ prefix: "/journal" })

  // GET /journal?companyId=&status=&periodId=
  .get("/", async ({ query, cookie, set }) => {
    const token = (cookie["session"]?.value as string);
    const session = token ? await validateSession(token) : null;
    if (!session) { set.status = 401; return { error: "Not authenticated" }; }
    if (!(query.companyId as string)) { set.status = 400; return { error: "companyId required" }; }

    return await listEntries((query.companyId as string), {
      status:   (query.status as string),
      periodId: (query.periodId as string),
      limit:    (query.limit as string) ? parseInt((query.limit as string)) : 100,
      offset:   (query.offset as string) ? parseInt((query.offset as string)) : 0,
    });
  })

  // GET /journal/:id
  .get("/:id", async ({ params, cookie, set }) => {
    const token = (cookie["session"]?.value as string);
    if (!token || !(await validateSession(token))) { set.status = 401; return { error: "Not authenticated" }; }
    return await getEntryWithLines((params.id as string));
  })

  // POST /journal — create draft
  .use(requirePermission("journal", "create"))
  .post(
    "/",
    async ({ body, cookie, set }) => {
      const token = (cookie["session"]?.value as string);
      const session = token ? await validateSession(token) : null;
      if (!session) { set.status = 401; return { error: "Not authenticated" }; }

      try {
        const id = await createDraft(
          {
            companyId:   body.companyId,
            entryDate:   body.entryDate,
            description: body.description,
            reference:   body.reference ?? null,
            isAdjusting: body.isAdjusting ?? false,
            periodId:    body.periodId,
            createdBy:   session.userId,
          },
          body.lines.map((l: any) => ({ ...l, description: l.description ?? null }))
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
  .post("/:id/post", async ({ params, cookie, request, set }) => {
    const token = (cookie["session"]?.value as string);
    const session = token ? await validateSession(token) : null;
    if (!session) { set.status = 401; return { error: "Not authenticated" }; }

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    try {
      await post((params.id as string), session.userId, session.sessionId, ip);
      return { message: "Journal entry posted" };
    } catch (err) {
      if (err instanceof ValidationError) {
        set.status = 422;
        return { error: err.message };
      }
      throw err;
    }
  })

  // POST /journal/:id/void
  .use(requirePermission("journal", "void"))
  .post("/:id/void", async ({ params, cookie, request, set }) => {
    const token = (cookie["session"]?.value as string);
    const session = token ? await validateSession(token) : null;
    if (!session) { set.status = 401; return { error: "Not authenticated" }; }

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    try {
      await voidEntry((params.id as string), session.userId, session.sessionId, ip);
      return { message: "Journal entry voided" };
    } catch (err) {
      if (err instanceof ValidationError) {
        set.status = 422;
        return { error: err.message };
      }
      throw err;
    }
  });

