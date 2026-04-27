import { Elysia, t } from 'elysia';
import { db } from '../db/connection';
import { chartOfAccounts } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { addAccount, deactivateAccount, seedGaapForCompany } from '../services/accounts.service';
import { authMiddleware, requireAuth } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware.ts';

export const glAccountsRoutes = new Elysia({ prefix: '/gl-accounts' })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })

  // GET /gl-accounts — returns all active accounts for the active company.
  // If the company has no accounts yet, seeds the full US GAAP chart automatically.
  .use(requirePermission('accounts', 'read'))
  .get('/', async ({ companyId, set }) => {
    if (!companyId) {
      set.status = 403;
      return { error: 'No active company in session.' };
    }

    // Check if this company already has accounts seeded
    const existing = await db
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId))
      .limit(1);

    // Auto-seed the full US GAAP chart of accounts on first access
    if (existing.length === 0) {
      await seedGaapForCompany(companyId);
    }

    const accounts = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId));

    return accounts
      .filter(a => a.isActive)
      .sort((a, b) => a.code.localeCompare(b.code));
  })

  // POST /gl-accounts — create a new custom account
  .use(requirePermission('accounts', 'create'))
  .post('/', async ({ body, companyId, set }) => {
    if (!companyId) {
      set.status = 403;
      return { error: 'No active company in session.' };
    }
    try {
      const id = await addAccount({
        companyId,
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
      code:          t.String(),
      name:          t.String(),
      accountType:   t.Union([
        t.Literal('asset'), t.Literal('liability'),
        t.Literal('equity'), t.Literal('revenue'),
        t.Literal('expense'),
      ]),
      normalBalance: t.Union([t.Literal('debit'), t.Literal('credit')]),
      description:   t.Optional(t.String()),
      parentCode:    t.Optional(t.String()),
    })
  })

  // PATCH /gl-accounts/:id — edit name, code, or description
  .use(requirePermission('accounts', 'update'))
  .patch('/:id', async ({ params, body, companyId, set }) => {
    if (!companyId) {
      set.status = 403;
      return { error: 'No active company in session.' };
    }
    const { id } = params;

    // Tenant Isolation Check
    const [existingAccount] = await db
      .select({ companyId: chartOfAccounts.companyId, code: chartOfAccounts.code })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.id, id))
      .limit(1);

    if (!existingAccount) {
      set.status = 404;
      return { error: 'Cuenta no encontrada' };
    }

    if (existingAccount.companyId !== companyId) {
      set.status = 403;
      return { error: 'Acceso denegado' };
    }

    const { name, description, code, parentCode } = body;

    const updates: Partial<typeof chartOfAccounts.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (name)                       updates.name        = name;
    if (description !== undefined)  updates.description = description;

    if (code && code !== existingAccount.code) {
      const [codeExists] = await db
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)))
        .limit(1);

      if (codeExists) {
        set.status = 409;
        return { error: `El código ${code} ya está en uso` };
      }
      updates.code = code;
    }

    // Update parent account (parentCode: null = root, '' = clear parent, code = set new parent)
    if (parentCode !== undefined) {
      if (parentCode === null || parentCode === '') {
        updates.parentId = null;
        updates.level    = 1;
      } else {
        const [parent] = await db
          .select({ id: chartOfAccounts.id, level: chartOfAccounts.level })
          .from(chartOfAccounts)
          .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, parentCode)))
          .limit(1);

        if (!parent) {
          set.status = 422;
          return { error: `Cuenta padre con código ${parentCode} no encontrada` };
        }
        if (parent.id === id) {
          set.status = 422;
          return { error: 'Una cuenta no puede ser su propio padre' };
        }
        updates.parentId = parent.id;
        updates.level    = (parent.level ?? 1) + 1;
      }
    }

    await db.update(chartOfAccounts)
      .set(updates)
      .where(and(eq(chartOfAccounts.id, id), eq(chartOfAccounts.companyId, companyId)));

    return { message: 'Cuenta actualizada' };
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name:        t.Optional(t.String()),
      description: t.Optional(t.String()),
      code:        t.Optional(t.String()),
      parentCode:  t.Optional(t.Nullable(t.String())),
    })
  })

  // DELETE /gl-accounts/:id — soft-deactivate (system accounts are protected)
  .use(requirePermission('accounts', 'delete'))
  .delete('/:id', async ({ params, companyId, set }) => {
    if (!companyId) {
      set.status = 403;
      return { error: 'No active company in session.' };
    }

    // Tenant Isolation Check
    const [existingAccount] = await db
      .select({ companyId: chartOfAccounts.companyId })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.id, params.id))
      .limit(1);

    if (!existingAccount) {
      set.status = 404;
      return { error: 'Cuenta no encontrada' };
    }

    if (existingAccount.companyId !== companyId) {
      set.status = 403;
      return { error: 'Acceso denegado' };
    }

    try {
      await deactivateAccount(params.id, companyId);
      return { message: 'Cuenta desactivada' };
    } catch (err) {
      set.status = 422;
      return { error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, {
    params: t.Object({ id: t.String() })
  });
