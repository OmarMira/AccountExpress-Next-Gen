import { Elysia, t } from "elysia";
import { statementImportService } from "../services/bank/statement-import.service.ts";
import { suggestAccount } from "../services/bank/smart-match.service.ts";
import { matchTransaction, ignoreTransaction } from "../services/bank/reconciliation.service.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { validateSession } from "../services/session.service.ts";
import { rawDb } from "../db/connection.ts";

export const bankRoutes = new Elysia({ prefix: "/bank" })
  // ─────────────────────────────────────────────────────────────
  // 1. IMPORT CSV (bank:create)
  // ─────────────────────────────────────────────────────────────
  .use(requirePermission("bank", "create"))
  .post(
    "/import",
    async ({ body, cookie, set }) => {
      const token = cookie["session"].value as string;
      const session = token ? validateSession(token) : null;
      if (!session) { set.status = 401; return { error: "Not authenticated" }; }

      const file = body.file as File;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (file.name.toLowerCase().endsWith('.pdf')) {
        set.status = 400;
        return { error: 'PDF_REQUIRES_CLIENT_PARSE', message: 'Los PDFs se procesan en el navegador antes de enviarse.' };
      }

      try {
        const result = await statementImportService.processFile(
          body.companyId,
          body.bankAccountId || "",
          buffer,
          file.name
        );
        return { success: true, ...result };
      } catch (err: any) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.code === 'UNKNOWN_BANK') {
            set.status = 400;
            return { error: 'UNKNOWN_BANK', bankName: parsed.bankName };
          }
        } catch(e) {}
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        file: t.File(),
        bankAccountId: t.Optional(t.String()),
        companyId: t.String()
      })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 1B. IMPORT JSON PARSED TRANSACTIONS (bank:create)
  // ─────────────────────────────────────────────────────────────
  .post(
    "/import-parsed",
    async ({ body, cookie, set }) => {
      const token = cookie["session"].value as string;
      const session = token ? validateSession(token) : null;
      if (!session) { set.status = 401; return { error: "Not authenticated" }; }

      try {
        const result = await statementImportService.processParsedBatch(
          body.companyId,
          body.bankAccountId || undefined,
          body.transactions,
          body.bankName || undefined,
          body.importBatchId
        );
        return { success: true, ...result };
      } catch (err: any) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.code === 'UNKNOWN_BANK') {
            set.status = 400;
            return { error: 'UNKNOWN_BANK', bankName: parsed.bankName };
          }
        } catch(e) {}
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        transactions: t.Array(t.Object({
          date: t.String(),
          description: t.String(),
          amount: t.Number(),
          balance: t.Optional(t.Number())
        })),
        bankAccountId: t.Optional(t.String()),
        bankName: t.Optional(t.String()),
        fileName: t.String(),
        importBatchId: t.String(),
        companyId: t.String()
      })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 2. GET TRANSACTIONS (bank:read)
  // ─────────────────────────────────────────────────────────────
  .use(requirePermission("bank", "read"))
  .get(
    "/transactions",
    ({ query, cookie, set }) => {
      const token = cookie["session"].value as string;
      const session = token ? validateSession(token) : null;
      if (!session) { set.status = 401; return { error: "Not authenticated" }; }

      let sql = `SELECT * FROM bank_transactions WHERE company_id = ?`;
      const params: any[] = [query.companyId];
      if (query.status) {
        sql += ` AND status = ?`;
        params.push(query.status);
      }
      sql += ` ORDER BY transaction_date DESC`;
      const txs = rawDb.query(sql).all(...params);
      return { success: true, data: txs };
    },
    {
      query: t.Object({
        companyId: t.String(),
        status: t.Optional(t.String())
      })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 3. GET MATCH SUGGESTIONS (bank:read)
  // ─────────────────────────────────────────────────────────────
  .use(requirePermission("bank", "read"))
  .get(
    "/suggest",
    ({ query, cookie, set }) => {
      const token = cookie["session"].value as string;
      const session = token ? validateSession(token) : null;
      if (!session) { set.status = 401; return { error: "Not authenticated" }; }

      const suggestions = suggestAccount(query.companyId, query.description);
      return { success: true, data: suggestions };
    },
    {
      query: t.Object({
        companyId: t.String(),
        description: t.String()
      })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 4. RECONCILE (bank:reconcile)
  // ─────────────────────────────────────────────────────────────
  .use(requirePermission("bank", "reconcile"))
  .post(
    "/reconcile/:id",
    ({ params, body, cookie, request, set }) => {
      const token = cookie["session"].value as string;
      const session = token ? validateSession(token) : null;
      if (!session) { set.status = 401; return { error: "Not authenticated" }; }

      const ip = request.headers.get("x-forwarded-for") ?? "unknown";

      const draftId = matchTransaction(
        body.companyId,
        params.id,
        body.targetAccountId,
        body.bankAccountId,
        body.periodId,
        session.userId,
        session.sessionId,
        ip
      );
      
      return { success: true, journalEntryId: draftId };
    },
    {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        companyId: t.String(),
        targetAccountId: t.String(),
        bankAccountId: t.String(),
        periodId: t.String()
      })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 5. IGNORE (bank:reconcile)
  // ─────────────────────────────────────────────────────────────
  .use(requirePermission("bank", "reconcile"))
  .post(
    "/ignore/:id",
    ({ params, body, cookie, request, set }) => {
      const token = cookie["session"].value as string;
      const session = token ? validateSession(token) : null;
      if (!session) { set.status = 401; return { error: "Not authenticated" }; }

      const ip = request.headers.get("x-forwarded-for") ?? "unknown";

      ignoreTransaction(body.companyId, params.id, session.userId, ip);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ companyId: t.String() })
    }
  );
