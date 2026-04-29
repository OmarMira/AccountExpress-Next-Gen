import { Elysia, t } from 'elysia';
import { db } from '../db/connection';
import { bankAccounts } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
// ⚠️ FIX: Import authMiddleware to get session context (user, companyId) server-side.
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const bankAccountsRoutes = new Elysia({ prefix: '/bank-accounts' })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })

  // ⚠️ FIX: companyId is now read from the authenticated session (ctx.companyId),
  // NOT from the query string. This prevents a tenant-escalation attack where an
  // authenticated user sends another company's companyId to read foreign data.
  .use(requirePermission('bank-accounts', 'read'))
  .get('/', async ({ companyId, set }) => {
    if (!companyId) {
      set.status = 403;
      return { error: 'No active company in session. Select a company first.' };
    }

    const accounts = await db.query.bankAccounts.findMany({
      where: and(
        eq(bankAccounts.companyId, companyId),
        eq(bankAccounts.isActive, true)
      ),
      orderBy: (bankAccounts, { asc }) => [asc(bankAccounts.accountName)]
    });
    return accounts.map(a => ({
      ...a,
      balance: (a.balance || 0) / 100
    }));
  })

  .use(requirePermission('bank-accounts', 'write'))
  .post('/', async ({ body, companyId, set }) => {
    // ⚠️ FIX: companyId comes exclusively from the session, not from the request body.
    if (!companyId) {
      set.status = 403;
      return { error: 'No active company in session.' };
    }

    try {
      if (body.accountNumber) {
        const existing = await db.query.bankAccounts.findFirst({
          where: and(
            eq(bankAccounts.companyId, companyId),
            eq(bankAccounts.accountNumber, body.accountNumber)
          )
        });
        if (existing) return existing;
      }

      const now = new Date();
      const newAccount = {
        id: uuidv4(),
        companyId,                                          // from session
        accountName: body.accountName,
        bankName: body.bankName,
        accountNumber: body.accountNumber || null,
        accountType: body.accountType || 'checking',
        balance: Math.round((body.balance || 0) * 100),
        glAccountId: body.glAccountId || null,
        isActive: true,
        createdAt: now,
        updatedAt: now
      };

      await db.insert(bankAccounts).values(newAccount);
      return newAccount;
    } catch (error: unknown) {
      set.status = 500;
      return { error: 'Failed to create bank account', details: errMsg(error) };
    }
  }, {
    // ⚠️ FIX: companyId removed from body schema — it is no longer accepted from the client.
    body: t.Object({
      accountName: t.String(),
      bankName: t.String(),
      accountNumber: t.Optional(t.String()),
      accountType: t.Optional(t.String()),
      balance: t.Optional(t.Number()),
      currency: t.Optional(t.String()),
      routingNumber: t.Optional(t.String()),
      notes: t.Optional(t.String()),
      glAccountId: t.Optional(t.String())
    }, { additionalProperties: false })
  })

  .put('/:id', async ({ params, body, companyId, set }) => {
    const { id } = params;

    // ⚠️ FIX: Verify the target record belongs to the session's company before updating.
    if (!companyId) {
      set.status = 403;
      return { error: 'No active company in session.' };
    }

    try {
      const existing = await db.query.bankAccounts.findFirst({
        where: and(
          eq(bankAccounts.id, id),
          eq(bankAccounts.companyId, companyId)   // tenant ownership check
        )
      });

      if (!existing) {
        set.status = 404;
        return { error: 'Bank account not found' };
      }

      const now = new Date();
      
      const updateData: {
        updatedAt: Date;
        accountName?: string;
        bankName?: string;
        accountNumber?: string;
        accountType?: string;
        balance?: number;
        glAccountId?: string;
        isActive?: boolean;
      } = {
        updatedAt: now
      };
      
      if (body.accountName !== undefined) updateData.accountName = body.accountName;
      if (body.bankName !== undefined) updateData.bankName = body.bankName;
      if (body.accountNumber !== undefined) updateData.accountNumber = body.accountNumber;
      if (body.accountType !== undefined) updateData.accountType = body.accountType;
      if (body.balance !== undefined) updateData.balance = Math.round(body.balance * 100);
      if (body.glAccountId !== undefined) updateData.glAccountId = body.glAccountId;
      if (body.isActive !== undefined) updateData.isActive = body.isActive ? true : false;

      const updated = await db.update(bankAccounts)
        .set(updateData)
        .where(and(eq(bankAccounts.id, id), eq(bankAccounts.companyId, companyId)))
        .returning();

      if (updated.length === 0) {
        set.status = 404;
        return { error: 'Bank account not found' };
      }

      return updated[0];
    } catch (error: unknown) {
      set.status = 500;
      return { error: 'Failed to update bank account', details: errMsg(error) };
    }
  }, {
    body: t.Object({
      accountName: t.Optional(t.String()),
      bankName: t.Optional(t.String()),
      accountNumber: t.Optional(t.String()),
      accountType: t.Optional(t.String()),
      balance: t.Optional(t.Number()),
      glAccountId: t.Optional(t.String()),
      isActive: t.Optional(t.Boolean())
    }, { additionalProperties: false })
  })

  .delete('/:id', async ({ params, companyId, set }) => {
    const { id } = params;

    // Verify tenant ownership before soft-deleting.
    if (!companyId) {
      set.status = 403;
      return { error: 'No active company in session.' };
    }

    try {
      const account = await db.query.bankAccounts.findFirst({
        where: and(eq(bankAccounts.id, id), eq(bankAccounts.companyId, companyId))
      });

      if (!account) {
        set.status = 404;
        return { error: 'Bank account not found' };
      }

      // Ensure no transactions exist before deleting
      const txCountQuery = account.accountNumber
        ? sql`SELECT COUNT(*) FROM bank_transactions WHERE company_id = ${companyId} AND (bank_account = ${id} OR bank_account = ${account.accountNumber})`
        : sql`SELECT COUNT(*) FROM bank_transactions WHERE company_id = ${companyId} AND bank_account = ${id}`;
        
      const txCountResult = await db.execute(txCountQuery);
      
      if (Number(txCountResult[0].count) > 0) {
        set.status = 400;
        return { 
          error: 'Restricción de Integridad',
          details: 'No se puede eliminar esta cuenta bancaria porque tiene transacciones importadas o registradas. Si ya no la usas, ignora futuras importaciones, pero el historial debe conservarse.' 
        };
      }

      const now = new Date();
      const updated = await db.update(bankAccounts)
        .set({ isActive: false, updatedAt: now })
        .where(and(eq(bankAccounts.id, id), eq(bankAccounts.companyId, companyId)))
        .returning();

      if (updated.length === 0) {
        set.status = 404;
        return { error: 'Bank account not found' };
      }

      return { success: true, message: 'Bank account deactivated successfully' };
    } catch (error: unknown) {
      set.status = 500;
      return { error: 'Failed to deactivate bank account', details: errMsg(error) };
    }
  });
