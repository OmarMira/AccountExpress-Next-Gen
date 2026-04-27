import { Elysia, t } from "elysia";
import { BankRulesService } from "../services/bank/bank-rules.service";
import { authMiddleware, requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { db } from "../db/connection.ts";
import { bankRules } from "../db/schema/index.ts";
import { eq, and } from "drizzle-orm";

export const bankRulesRouter = new Elysia({ prefix: "/bank-rules" })
  .use(authMiddleware)
  .guard({ beforeHandle: requireAuth })

  .use(requirePermission("bank-rules", "read"))
  .get("/", async ({ companyId, set }) => {
    if (!companyId) { set.status = 403; return { error: 'No active company.' }; }
    return await BankRulesService.getRules(companyId);
  })

  .use(requirePermission("bank-rules", "write"))
  .post("/", async ({ body, companyId, set }) => {
    if (!companyId) { set.status = 403; return { error: 'No active company.' }; }
    const b = body as any;
    return await BankRulesService.createRule({
      name: b.name,
      conditionType: b.conditionType,
      conditionValue: b.conditionValue,
      transactionDirection: b.transactionDirection,
      glAccountId: b.glAccountId,
      autoAdd: b.autoAdd,
      priority: b.priority,
      isActive: b.isActive ?? true,
      companyId,
    });
  }, {
    body: t.Object({
      name: t.String(),
      conditionType: t.Enum({ contains: "contains", starts_with: "starts_with", equals: "equals" }),
      conditionValue: t.String(),
      transactionDirection: t.Enum({ debit: "debit", credit: "credit", any: "any" }),
      glAccountId: t.String(),
      autoAdd: t.Boolean(),
      priority: t.Number(),
      isActive: t.Optional(t.Boolean()),
    })
  })

  .patch("/:id", async ({ params: { id }, body, companyId, set }) => {
    if (!companyId) { set.status = 403; return { error: 'No active company.' }; }

    // Tenant Isolation Check
    const [existing] = await db
      .select({ companyId: bankRules.companyId })
      .from(bankRules)
      .where(eq(bankRules.id, id))
      .limit(1);

    if (!existing) {
      set.status = 404;
      return { success: false, error: 'Regla no encontrada' };
    }

    if (existing.companyId !== companyId) {
      set.status = 403;
      return { success: false, error: 'Acceso denegado' };
    }

    return await BankRulesService.updateRule(id, body as any);
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Partial(t.Object({
      name: t.String(),
      conditionType: t.Enum({ contains: "contains", starts_with: "starts_with", equals: "equals" }),
      conditionValue: t.String(),
      transactionDirection: t.Enum({ debit: "debit", credit: "credit", any: "any" }),
      glAccountId: t.String(),
      autoAdd: t.Boolean(),
      priority: t.Number(),
      isActive: t.Boolean(),
    }))
  })

  .delete("/:id", async ({ params: { id }, companyId, set }) => {
    if (!companyId) { set.status = 403; return { error: 'No active company.' }; }

    // Tenant Isolation Check
    const [existing] = await db
      .select({ companyId: bankRules.companyId })
      .from(bankRules)
      .where(eq(bankRules.id, id))
      .limit(1);

    if (!existing) {
      set.status = 404;
      return { success: false, error: 'Regla no encontrada' };
    }

    if (existing.companyId !== companyId) {
      set.status = 403;
      return { success: false, error: 'Acceso denegado' };
    }

    return await BankRulesService.deleteRule(id);
  }, {
    params: t.Object({ id: t.String() })
  });
