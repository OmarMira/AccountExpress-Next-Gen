// ============================================================
// BANK ROUTES — PostgreSQL 16 / Drizzle ORM
// Security: companyId is ALWAYS extracted from the session,
// never from the request body or query parameters.
// ============================================================

import { Elysia, t } from "elysia";
import { statementImportService } from "../services/bank/statement-import.service.ts";
import { suggestAccountBatch } from "../services/bank/smart-match.service.ts";
import { 
  matchTransaction, 
  ignoreTransaction, 
  matchAgainstJournal,
  unreconcileTransaction,
  getBankAccountBalanceSummary
} from "../services/bank/reconciliation.service.ts";
import { runAutoMatch, runGroupMatch } from "../services/bank/auto-match.service.ts";
import { createAuditEntry } from "../services/audit.service.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";
import { getReconciliationReport, getOpenItemsReport } from "../services/bank/reconciliation-report.service.ts";
import { parseBankPdf } from "../services/bank/pdf-parser.service.ts";

import { db, sql } from "../db/connection.ts";
import { eq, and } from "drizzle-orm";
import { bankTransactions } from "../db/schema/index.ts";

export const bankRoutes = new Elysia({ prefix: "/bank" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })
  // ─────────────────────────────────────────────────────────────
  // 1. IMPORT CSV / OFX / QFX (bank:create)
  // ─────────────────────────────────────────────────────────────
  .use(requirePermission("bank", "create"))
  .post(
    "/import",
    async ({ body, companyId, set }) => {
      if (!companyId) {
        set.status = 403;
        return { error: "No active company in session." };
      }

      const file = body.file as File;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (file.name.toLowerCase().endsWith('.pdf')) {
        set.status = 400;
        return { error: 'PDF_REQUIRES_CLIENT_PARSE', message: 'Los PDFs se procesan en el navegador antes de enviarse.' };
      }

      const result = await statementImportService.processFile(
        companyId,
        body.bankAccountId ?? "",
        buffer,
        file.name
      );
      return { success: true, ...result };
    },
    {
      body: t.Object({
        file: t.File(),
        bankAccountId: t.Optional(t.String()),
      }, { additionalProperties: false })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 1B. INSPECT PDF (DRY-RUN)
  // ─────────────────────────────────────────────────────────────
  .post(
    "/inspect-pdf",
    async ({ body, set }) => {
      try {
        const buffer = await body.file.arrayBuffer();
        const result = await parseBankPdf(buffer, body.file.name);

        return {
          success: true,
          data: {
            bankName: result.bankName,
            accountNumber: result.accountNumber,
            accountHolder: result.accountHolder,
            openingBalance: result.beginningBalance,
            periodStart: result.periodStart,
            periodEnd: result.periodEnd,
            transactions: result.transactions,
            totalRows: result.totalRows,
            rejectedRows: result.rejectedRows,
            rejectedReasons: result.rejectedReasons
          }
        };
      } catch (error: any) {
        set.status = 422;
        return { success: false, error: error.message };
      }
    },
    {
      body: t.Object({
        file: t.File({ type: 'application/pdf', maxSize: '10m' })
      }, { additionalProperties: false })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 1C. IMPORT PDF BINARY (SECURE BACKEND PARSE)
  // ─────────────────────────────────────────────────────────────
  .post(
    "/import-pdf",
    async ({ body, companyId, set }) => {
      if (!companyId) {
        set.status = 403;
        return { error: "No active company in session." };
      }

      try {
        const buffer = await body.file.arrayBuffer();
        const parseResult = await parseBankPdf(buffer, body.file.name);

        const importResult = await statementImportService.processParsedBatch(
          companyId,
          body.bankAccountId,
          parseResult.transactions,
          parseResult.bankName,
          parseResult.accountNumber,
          body.importBatchId
        );

        // Update initial balance if applicable
        if (
          importResult.bankAccountId &&
          parseResult.beginningBalance !== undefined &&
          parseResult.periodStart
        ) {
          await statementImportService.updateInitialBalanceIfEarlier(
            companyId,
            importResult.bankAccountId,
            parseResult.beginningBalance,
            parseResult.periodStart
          );
        }

        return {
          success: true,
          data: {
            imported: importResult.importedCount,
            rejected: parseResult.rejectedRows,
            reasons: parseResult.rejectedReasons,
            transactions: parseResult.transactions,
            bankAccountId: importResult.bankAccountId
          }
        };
      } catch (error: any) {
        set.status = 400;
        return { success: false, error: error.message };
      }
    },
    {
      body: t.Object({
        file: t.File({ type: 'application/pdf', maxSize: '10m' }),
        bankAccountId: t.String(),
        importBatchId: t.String()
      }, { additionalProperties: false })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 2. GET TRANSACTIONS (bank:read)
  // ─────────────────────────────────────────────────────────────
  .use(requirePermission("bank", "read"))
  .get(
    "/transactions",
    async ({ query, companyId, set }) => {
      if (!companyId) {
        set.status = 403;
        return { error: "No active company in session." };
      }

      const conditions = [eq(bankTransactions.companyId, companyId)];
      if (query.status) {
        conditions.push(eq(bankTransactions.status, query.status));
      }

      const txs = await db
        .select()
        .from(bankTransactions)
        .where(and(...conditions))
        .orderBy(sql`${bankTransactions.transactionDate} DESC`);

      const descriptions = Array.from(new Set(txs.map(tx => tx.description)));
      
      const suggestionMap = await suggestAccountBatch(companyId, descriptions);

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
        status: t.Optional(t.String())
      }, { additionalProperties: false })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 3. GET MATCH SUGGESTIONS (bank:read)
  // ─────────────────────────────────────────────────────────────
  .use(requirePermission("bank", "read"))
  .get(
    "/suggest",
    async ({ query, companyId, set }) => {
      if (!companyId) {
        set.status = 403;
        return { error: "No active company in session." };
      }

      const suggestionMap = await suggestAccountBatch(companyId, [query.description]);
      return { success: true, data: suggestionMap.get(query.description) ?? [] };
    },
    {
      query: t.Object({
        description: t.String()
      }, { additionalProperties: false })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 4. RECONCILE (bank:approve)
  // ─────────────────────────────────────────────────────────────
  .use(requirePermission("bank", "approve"))
  .post(
    "/reconcile/:id",
    async ({ params, body, request, companyId, set, user, sessionId }) => {
      if (!companyId) {
        set.status = 403;
        return { error: "No active company in session." };
      }

      const uid = user!;
      const sid = sessionId!;
      const ip = request.headers.get("x-forwarded-for") ?? "unknown";

      const draftId = await matchTransaction(
        companyId,
        params.id,
        body.targetAccountId || null,
        body.bankAccountId,
        body.periodId,
        uid,
        sid,
        ip,
        undefined,
        'new_entry',
        body.splits
      );

      return { success: true, journalEntryId: draftId };
    },
    {
      params: t.Object({
        id: t.String()
      }, { additionalProperties: false }),
      body: t.Object({
        targetAccountId: t.Optional(t.String()),
        bankAccountId: t.String(),
        periodId: t.String(),
        splits: t.Optional(t.Array(t.Object({
          glAccountId: t.String(),
          amount: t.Number()
        })))
      }, { additionalProperties: false })
    }
  )

  // ─────────────────────────────────────────────────────────────
  // 5. IGNORE & 6. ASSIGN
  // ─────────────────────────────────────────────────────────────
  .group("", app => app
    .use(requirePermission("bank", "approve"))
    .post(
      "/ignore/:id",
      async ({ params, body, request, companyId, set, user }) => {
        if (!companyId) {
          set.status = 403;
          return { error: "No active company in session." };
        }

        const uid = user!;
        const ip = request.headers.get("x-forwarded-for") ?? "unknown";

        await ignoreTransaction(companyId, params.id, uid, ip);
        return { success: true };
      },
      {
        params: t.Object({ id: t.String() }, { additionalProperties: false }),
        body: t.Object({}, { additionalProperties: false })
      }
    )

    .patch(
      "/transactions/:id",
      async ({ params, body, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { error: "No active company in session." };
        }

        const [existing] = await db
          .select({ id: bankTransactions.id })
          .from(bankTransactions)
          .where(
            and(
              eq(bankTransactions.id, params.id),
              eq(bankTransactions.companyId, companyId)
            )
          )
          .limit(1);

        if (!existing) {
          set.status = 404;
          return { error: "Transacción no encontrada" };
        }

        const updateData: any = {};
        if (body.glAccountId !== undefined) {
          updateData.glAccountId = body.glAccountId === "" ? null : body.glAccountId;
          updateData.status = "assigned";
        }
        if (body.splits !== undefined) {
          updateData.reconciliationSplits = body.splits;
          updateData.status = "assigned";
        }
        if (body.transactionDate !== undefined) updateData.transactionDate = body.transactionDate;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.amount !== undefined) updateData.amount = body.amount;

        await db.update(bankTransactions)
          .set(updateData)
          .where(eq(bankTransactions.id, params.id));

        return { success: true, message: "Transacción actualizada" };
      },
      {
        params: t.Object({ id: t.String() }, { additionalProperties: false }),
        body: t.Object({
          glAccountId: t.Optional(t.String()),
          splits: t.Optional(t.Array(t.Object({
            glAccountId: t.String(),
            amount: t.Number()
          }))),
          transactionDate: t.Optional(t.String()),
          description: t.Optional(t.String()),
          amount: t.Optional(t.Number())
        }, { additionalProperties: false })
      }
    )

    // ─────────────────────────────────────────────────────────
    // 7. AUTO-MATCH (bank:approve)
    // ─────────────────────────────────────────────────────────
    .post(
      "/auto-match",
      async ({ body, companyId, user, sessionId, request, set }) => {
        if (!companyId) {
          set.status = 403;
          return { error: "No active company in session." };
        }

        const uid = user!;
        const sid = sessionId!;
        const ip  = request.headers.get("x-forwarded-for") ?? "unknown";

        const l1 = await runAutoMatch(companyId, body.bankAccountId, body.periodId, uid, sid, ip, body.limit);
        const l2 = await runGroupMatch(companyId, body.bankAccountId, body.periodId, uid, sid, ip, body.limit);

        await createAuditEntry({
          companyId,
          userId:      uid,
          sessionId:   sid,
          action:      "bank:auto_match",
          module:      "bank",
          entityType:  "bank_account",
          entityId:    body.bankAccountId,
          beforeState: null,
          afterState: {
            level1: { matched: l1.matched, pending: l1.pending },
            level2: { matched: l2.matched, pending: l2.pending },
          },
          ipAddress: ip,
        });

        return {
          success: true,
          matched: l1.matched + l2.matched,
          pending: l2.pending,
          errors:  [...l1.errors, ...l2.errors],
        };
      },
      {
        body: t.Object({
          bankAccountId: t.String(),
          periodId:      t.String(),
          limit:         t.Optional(t.Number({ default: 100 })),
        }, { additionalProperties: false })
      }
    )
    // ─────────────────────────────────────────────────────────
    // UNRECONCILE
    // ─────────────────────────────────────────────────────────
    .post(
      "/unreconcile",
      async ({ body, companyId, user, sessionId, request, set }) => {
        if (!companyId) {
          set.status = 403;
          return { error: "No active company in session." };
        }

        try {
          await unreconcileTransaction({
            companyId,
            transactionId: body.transactionId,
            userId: user!,
            sessionId: sessionId!,
            ipAddress: request.headers.get("x-forwarded-for") ?? "unknown"
          });
          return { success: true };
        } catch (err: any) {
          set.status = 400;
          return { error: err.message };
        }
      },
      {
        body: t.Object({
          transactionId: t.String()
        }, { additionalProperties: false })
      }
    )
    // ─────────────────────────────────────────────────────────
    // 8. MATCH AGAINST JOURNAL (bank:approve)
    // ─────────────────────────────────────────────────────────
    .post(
      "/match-journal",
      async ({ body, companyId, user, sessionId, request, set }) => {
        if (!companyId) {
          set.status = 403;
          return { error: "No active company in session." };
        }

        try {
          await matchAgainstJournal({
            companyId,
            transactionId: body.transactionId,
            lineIds: body.lineIds,
            userId: user!,
            sessionId: sessionId!,
            ipAddress: request.headers.get("x-forwarded-for") ?? "unknown"
          });
          return { success: true };
        } catch (err: any) {
          set.status = 400;
          return { error: err.message };
        }
      },
      {
        body: t.Object({
          transactionId: t.String(),
          lineIds:       t.Array(t.String())
        }, { additionalProperties: false })
      }
    )
    // ─────────────────────────────────────────────────────────
    // 9. UNRECONCILE (bank:approve)
    // ─────────────────────────────────────────────────────────
    .post(
      "/unreconcile",
      async ({ body, companyId, user, sessionId, request, set }) => {
        if (!companyId) {
          set.status = 403;
          return { error: "No active company in session." };
        }

        try {
          await unreconcileTransaction({
            companyId,
            transactionId: body.transactionId,
            userId: user!,
            sessionId: sessionId!,
            ipAddress: request.headers.get("x-forwarded-for") ?? "unknown"
          });
          return { success: true };
        } catch (err: any) {
          set.status = 400;
          return { error: err.message };
        }
      },
      {
        body: t.Object({
          transactionId: t.String()
        }, { additionalProperties: false })
      }
    )
    // ─────────────────────────────────────────────────────────
    // 10. BALANCE SUMMARY (bank:read)
    // ─────────────────────────────────────────────────────────
    .get(
      "/accounts/:id/balance",
      async ({ params, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { error: "No active company in session." };
        }

        try {
          const summary = await getBankAccountBalanceSummary(companyId, params.id);
          return summary;
        } catch (err: any) {
          set.status = 400;
          return { error: err.message };
        }
      },
      {
        params: t.Object({ id: t.String() })
      }
    )
    // ─────────────────────────────────────────────────────────
    // 11. RECONCILIATION REPORT (bank:read)
    // ─────────────────────────────────────────────────────────
    .get(
      "/accounts/:id/reconciliation-report",
      async ({ params, query, companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { error: "No active company in session." };
        }

        if (!query.periodId) {
          set.status = 400;
          return { error: "periodId is required" };
        }

        try {
          const report = await getReconciliationReport(companyId, params.id, query.periodId);
          return report;
        } catch (err: any) {
          set.status = 400;
          return { error: err.message };
        }
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({ periodId: t.String() })
      }
    )
    // ─────────────────────────────────────────────────────────
    // 12. OPEN ITEMS REPORT (bank:read)
    // ─────────────────────────────────────────────────────────
    .get(
      "/reports/open-items",
      async ({ companyId, set }) => {
        if (!companyId) {
          set.status = 403;
          return { error: "No active company in session." };
        }

        try {
          const report = await getOpenItemsReport(companyId);
          return report;
        } catch (err: any) {
          set.status = 400;
          return { error: err.message };
        }
      }
    )
  );
