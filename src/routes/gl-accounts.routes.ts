import { Elysia, t } from 'elysia';
import { db } from '../db/connection';
import { chartOfAccounts } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { US_GAAP_ACCOUNTS } from '../db/seeds/gl-accounts.seed';
import { v4 as uuidv4 } from 'uuid';
import { addAccount, deactivateAccount } from '../services/accounts.service';
import { authMiddleware, requireAuth } from '../middleware/auth.middleware';

export const glAccountsRoutes = new Elysia({ prefix: '/gl-accounts' })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })

  // GET /gl-accounts?companyId=xxx
  .get('/', async ({ query }) => {
    const { companyId } = query;
    const existing = await db.select().from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId)).limit(1);
    
    if (existing.length === 0) {
      const now = new Date();
      for (const acc of US_GAAP_ACCOUNTS) {
        await db.insert(chartOfAccounts).values({
          id: uuidv4(), 
          companyId, 
          code: acc.code, 
          name: acc.name,
          accountType: acc.type, 
          description: acc.subtype,
          normalBalance: acc.normalBalance, 
          isSystem: acc.isSystem ? true : false,
          isActive: true, 
          createdAt: now, 
          updatedAt: now,
        }).onConflictDoNothing();
      }
    }
    
    const accounts = await db.select().from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId));
      
    return accounts.filter(a => a.isActive).sort((a, b) => a.code.localeCompare(b.code));
  }, { 
    query: t.Object({ 
      companyId: t.String() 
    }) 
  })

  // POST /gl-accounts — crear cuenta nueva
  .post('/', async ({ body, set }) => {
    try {
      const id = await addAccount({
        companyId:     body.companyId,
        code:          body.code,
        name:          body.name,
        accountType:   body.accountType,
        normalBalance: body.normalBalance,
        parentCode:    body.parentCode ?? null,
        taxCategory:   null,
        description:   body.description ?? null,
      });
      set.status = 201;
      return { id, message: 'Cuenta creada' };
    } catch (err) {
      set.status = 422;
      return { error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, {
    body: t.Object({
      companyId:     t.String(),
      code:          t.String(),
      name:          t.String(),
      accountType:   t.Union([t.Literal('asset'), t.Literal('liability'), 
                               t.Literal('equity'), t.Literal('revenue'), 
                               t.Literal('expense')]),
      normalBalance: t.Union([t.Literal('debit'), t.Literal('credit')]),
      description:   t.Optional(t.String()),
      parentCode:    t.Optional(t.String())
    })
  })

  // PATCH /gl-accounts/:id — editar nombre/descripción/código
  .patch('/:id', async ({ params, body, set }) => {
    const { id } = params;
    const { companyId, name, description, code } = body;
    
    const account = await db.select().from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, id), eq(chartOfAccounts.companyId, companyId))).limit(1);
      
    if (account.length === 0) { 
      set.status = 404; 
      return { error: 'Cuenta no encontrada' }; 
    }
    
    const updates: Partial<typeof chartOfAccounts.$inferInsert> & { updatedAt: Date } = { 
      updatedAt: new Date() 
    };
    
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (code) {
      const codeExists = await db.select().from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code))).limit(1);
        
      if (codeExists.length > 0 && codeExists[0].id !== id) {
        set.status = 409; 
        return { error: `El código ${code} ya está en uso` };
      }
      updates.code = code;
    }
    
    await db.update(chartOfAccounts).set(updates).where(eq(chartOfAccounts.id, id));
    
    return { message: 'Cuenta actualizada' };
  }, {
    params: t.Object({ 
      id: t.String() 
    }),
    body: t.Object({
      companyId: t.String(),
      name: t.Optional(t.String()),
      description: t.Optional(t.String()),
      code: t.Optional(t.String())
    })
  })

  // DELETE /gl-accounts/:id?companyId=xxx
  .delete('/:id', async ({ params, query, set }) => {
    const { id } = params;
    const { companyId } = query;
    try {
      await deactivateAccount(id, companyId);
      return { message: 'Cuenta desactivada' };
    } catch (err) {
      set.status = 422;
      return { error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, {
    params: t.Object({ id: t.String() }),
    query: t.Object({ companyId: t.String() })
  });
