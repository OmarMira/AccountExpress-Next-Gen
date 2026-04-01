import { Elysia, t } from 'elysia';
import { db } from '../db/connection';
import { bankAccounts } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from "../middleware/auth.middleware.ts";

export const bankAccountsRoutes = new Elysia({ prefix: '/bank-accounts' })
  .guard({ beforeHandle: requireAuth })
  .get('/', async ({ query }) => {
    const { companyId } = query as { companyId?: string };
    if (!companyId) return [];

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
  }, {
    query: t.Object({ companyId: t.String() })
  })

  .post('/', async ({ body, set }) => {
    const data = body as any;
    try {
      if (data.companyId && data.accountNumber) {
        const existing = await db.query.bankAccounts.findFirst({
          where: and(
            eq(bankAccounts.companyId, data.companyId),
            eq(bankAccounts.accountNumber, data.accountNumber)
          )
        });
        if (existing) return existing;
      }

      const now = new Date();
      const newAccount = {
        id: uuidv4(),
        companyId: data.companyId,
        accountName: data.accountName,
        bankName: data.bankName,
        accountNumber: data.accountNumber || null,
        accountType: data.accountType || 'checking',
        balance: Math.round((data.balance || 0) * 100),
        glAccountId: data.glAccountId || null,
        isActive: true,
        createdAt: now,
        updatedAt: now
      };

      await db.insert(bankAccounts).values(newAccount);
      return newAccount;
    } catch (error: any) {
      set.status = 500;
      return { error: 'Failed to create bank account', details: error.message };
    }
  }, {
    body: t.Object({
      companyId: t.String(),
      accountName: t.String(),
      bankName: t.String(),
      accountNumber: t.Optional(t.String()),
      accountType: t.Optional(t.String()),
      balance: t.Optional(t.Number()),
      currency: t.Optional(t.String()),
      routingNumber: t.Optional(t.String()),
      notes: t.Optional(t.String()),
      glAccountId: t.Optional(t.String())
    })
  })

  .put('/:id', async ({ params, body, set }) => {
    const { id } = params;
    const data = body as any;
    try {
      const now = new Date();
      
      const updateData: any = {
        updatedAt: now
      };
      
      if (data.accountName !== undefined) updateData.accountName = data.accountName;
      if (data.bankName !== undefined) updateData.bankName = data.bankName;
      if (data.accountNumber !== undefined) updateData.accountNumber = data.accountNumber;
      if (data.accountType !== undefined) updateData.accountType = data.accountType;
      if (data.balance !== undefined) updateData.balance = Math.round(data.balance * 100);
      if (data.glAccountId !== undefined) updateData.glAccountId = data.glAccountId;
      if (data.isActive !== undefined) updateData.isActive = data.isActive ? true : false;

      const updated = await db.update(bankAccounts)
        .set(updateData)
        .where(eq(bankAccounts.id, id))
        .returning();

      if (updated.length === 0) {
        set.status = 404;
        return { error: 'Bank account not found' };
      }

      return updated[0];
    } catch (error: any) {
      set.status = 500;
      return { error: 'Failed to update bank account', details: error.message };
    }
  }, {
    body: t.Object({
      accountName: t.Optional(t.String()),
      bankName: t.Optional(t.String()),
      accountNumber: t.Optional(t.String()),
      accountType: t.Optional(t.String()),
      glAccountId: t.Optional(t.String()),
      isActive: t.Optional(t.Boolean())
    })
  })

  .delete('/:id', async ({ params, set }) => {
    const { id } = params;
    try {
      const now = new Date();
      const updated = await db.update(bankAccounts)
        .set({ isActive: false, updatedAt: now })
        .where(eq(bankAccounts.id, id))
        .returning();

      if (updated.length === 0) {
        set.status = 404;
        return { error: 'Bank account not found' };
      }

      return { success: true, message: 'Bank account deactivated successfully' };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Failed to deactivate bank account', details: error.message };
    }
  });

