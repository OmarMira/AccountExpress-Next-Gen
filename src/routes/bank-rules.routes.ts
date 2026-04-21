import { Elysia, t } from "elysia";
import { BankRulesService } from "../services/bank/bank-rules.service";
import { authMiddleware } from "../middleware/auth.middleware";

export const bankRulesRouter = new Elysia({ prefix: "/bank-rules" })
  .use(authMiddleware)
  .get("/", async ({ query, companyId, set }) => {
    if (!companyId) { set.status = 403; return { error: 'No active company.' }; }
    return await BankRulesService.getRules(companyId);
  }, {
    query: t.Object({
      companyId: t.String(),
    })
  })
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
  .patch("/:id", async ({ params: { id }, body }) => {
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
  .delete("/:id", async ({ params: { id } }) => {
    return await BankRulesService.deleteRule(id);
  }, {
    params: t.Object({ id: t.String() })
  });
