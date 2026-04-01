// ============================================================
// BANK ROUTES — PostgreSQL 16 / Drizzle ORM
// ============================================================

import { Elysia, t } from "elysia";
import { statementImportService } from "../services/bank/statement-import.service.ts";
import { suggestAccountBatch } from "../services/bank/smart-match.service.ts";
import { matchTransaction, ignoreTransaction } from "../services/bank/reconciliation.service.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";

import { db, sql } from "../db/connection.ts";
import { eq, and } from "drizzle-orm";
import { bankTransactions } from "../db/schema/index.ts";

export const bankRoutes = new Elysia({ prefix: "/bank" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })
  // ─────────────────────────────────────────────────────────────
  // 1. IMPORT CSV (bank:create)
  // ─────────────────────────────────────────────────────────────
  .use(requirePermission("bank", "create"))
  .post(
    "/import",
    async ({ body, set }) => {
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
    async ({ body, set }) => {
      try {
        const result = await statementImportService.processParsedBatch(
          body.companyId,
          body.bankAccountId || undefined,
          body.transactions,
          body.bankName || undefined,
          body.accountNumber || undefined,
          body.importBatchId
        );
        return { success: true, ...result };
      } catch (err: any) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.code === 'UNKNOWN_BANK') {
            set.status = 400;
            return { error: 'UNKNOWN_BANK', bankName: parsed.bankName, accountNumber: parsed.accountNumber };
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
        accountNumber: t.Optional(t.String()),
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
    async ({ query }) => {
      let condition = eq(bankTransactions.companyId, query.companyId);
      if (query.status) {
        condition = and(condition, eq(bankTransactions.status, query.status)) as any;
      }

      const txs = await db
        .select()
        .from(bankTransactions)
        .where(condition)
        .orderBy(sql`${bankTransactions.transactionDate} DESC`);

      const descriptions = txs.map(tx => tx.description);
      const suggestionMap = await suggestAccountBatch(query.companyId, descriptions);
      const enriched = txs.map(tx => {
        const suggestions = suggestionMap.get(tx.description) ?? [];
        return {
          ...tx,
          suggestedCategory: suggestions[0]?.accountId ?? null,
          confidenceScore: suggestions[0]?.confidence ?? 0,
          isDuplicate: false,
        };
      });

      return { success: true, data: enriched };
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
    async ({ query }) => {
      const suggestionMap = await suggestAccountBatch(query.companyId, [query.description]);
      return { success: true, data: suggestionMap.get(query.description) ?? [] };
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
    async ({ params, body, request, set, user, sessionId }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";

      const draftId = await matchTransaction(
        body.companyId,
        params.id,
        body.targetAccountId,
        body.bankAccountId,
        body.periodId,
        user,
        sessionId,
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
  // 5. IGNORE & 6. ASSIGN
  // ─────────────────────────────────────────────────────────────
  .group("", app => app
    .use(requirePermission("bank", "reconcile"))
    .post(
    "/ignore/:id",
    async ({ params, body, request, set, user }) => {
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";

      await ignoreTransaction(body.companyId, params.id, user, ip);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ companyId: t.String() })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 6. ASSIGN GL ACCOUNT
  // ─────────────────────────────────────────────────────────────
  .patch(
    "/transactions/:id/assign",
    async ({ params, body, set }) => {
      if (!body.companyId || !body.glAccountId) {
        set.status = 400;
        return { error: "companyId y glAccountId requeridos" };
      }

      const [existing] = await db
        .select({ id: bankTransactions.id })
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.id, params.id),
            eq(bankTransactions.companyId, body.companyId)
          )
        )
        .limit(1);

      if (!existing) { set.status = 404; return { error: "Transacción no encontrada" }; }

      await db.update(bankTransactions)
        .set({ glAccountId: body.glAccountId, status: "assigned" })
        .where(eq(bankTransactions.id, params.id));

      return { success: true, message: "Cuenta asignada" };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        companyId: t.String(),
        glAccountId: t.String()
      })
    }
  ));
