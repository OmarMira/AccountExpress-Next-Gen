import { Elysia, t } from 'elysia';
import { db } from '../db/connection';
import { chartOfAccounts } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { US_GAAP_ACCOUNTS } from '../db/seeds/gl-accounts.seed';
import { v4 as uuidv4 } from 'uuid';

export const glAccountsRoutes = new Elysia({ prefix: '/gl-accounts' })

  // GET /gl-accounts?companyId=xxx
  .get('/', async ({ query }) => {
    const { companyId } = query as { companyId?: string };
    if (!companyId) return [];
    const existing = await db.select().from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId)).limit(1);
    if (existing.length === 0) {
      const now = new Date().toISOString();
      for (const acc of US_GAAP_ACCOUNTS) {
        await db.insert(chartOfAccounts).values({
          id: uuidv4(), companyId, code: acc.code, name: acc.name,
          accountType: acc.type, description: acc.subtype,
          normalBalance: acc.normalBalance, isSystem: acc.isSystem ? 1 : 0,
          isActive: 1, createdAt: now, updatedAt: now,
        }).onConflictDoNothing();
      }
    }
    const accounts = await db.select().from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId));
    return accounts.filter(a => a.isActive).sort((a, b) => a.code.localeCompare(b.code));
  }, { query: t.Object({ companyId: t.String() }) })

  // POST /gl-accounts — crear cuenta nueva
  .post('/', async ({ body, set }) => {
    const { companyId, code, name, accountType, normalBalance, description, parentCode } = body as any;
    if (!companyId || !code || !name || !accountType || !normalBalance) {
      set.status = 400; return { error: 'Faltan campos requeridos' };
    }
    const existing = await db.select().from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code))).limit(1);
    if (existing.length > 0) { set.status = 409; return { error: `El código ${code} ya existe` }; }
    const now = new Date().toISOString();
    const id = uuidv4();
    await db.insert(chartOfAccounts).values({
      id, companyId, code, name, accountType, normalBalance,
      description: description || null, isSystem: 0, isActive: 1,
      createdAt: now, updatedAt: now,
    });
    return { id, message: 'Cuenta creada' };
  })

  // PATCH /gl-accounts/:id — editar nombre/descripción/código
  .patch('/:id', async ({ params, body, set }) => {
    const { id } = params;
    const { companyId, name, description, code } = body as any;
    if (!companyId) { set.status = 400; return { error: 'companyId requerido' }; }
    const account = await db.select().from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, id), eq(chartOfAccounts.companyId, companyId))).limit(1);
    if (account.length === 0) { set.status = 404; return { error: 'Cuenta no encontrada' }; }
    const updates: any = { updatedAt: new Date().toISOString() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (code) {
      const codeExists = await db.select().from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code))).limit(1);
      if (codeExists.length > 0 && codeExists[0].id !== id) {
        set.status = 409; return { error: `El código ${code} ya está en uso` };
      }
      updates.code = code;
    }
    await db.update(chartOfAccounts).set(updates).where(eq(chartOfAccounts.id, id));
    return { message: 'Cuenta actualizada' };
  })

  // DELETE /gl-accounts/:id?companyId=xxx
  .delete('/:id', async ({ params, query, set }) => {
    const { id } = params;
    const { companyId } = query as { companyId?: string };
    if (!companyId) { set.status = 400; return { error: 'companyId requerido' }; }
    const account = await db.select().from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, id), eq(chartOfAccounts.companyId, companyId))).limit(1);
    if (account.length === 0) { set.status = 404; return { error: 'Cuenta no encontrada' }; }
    // Desactivar (soft delete) — la restricción de movimientos se agrega cuando exista la tabla de asientos
    await db.update(chartOfAccounts)
      .set({ isActive: 0, updatedAt: new Date().toISOString() })
      .where(eq(chartOfAccounts.id, id));
    return { message: 'Cuenta desactivada' };
  }, { query: t.Object({ companyId: t.String() }) });
