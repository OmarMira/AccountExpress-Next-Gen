// ============================================================
// ACCOUNTS ROUTES — /accounts (Chart of Accounts)
// ============================================================

import { Elysia, t } from "elysia";

import {
  getAccountsWithBalances,
  addAccount,
  deactivateAccount,
} from "../services/accounts.service.ts";
import { requirePermission } from "../middleware/rbac.middleware.ts";
import { requireAuth } from "../middleware/auth.middleware.ts";

export const accountsRoutes = new Elysia({ prefix: "/accounts" })
  .guard({ beforeHandle: requireAuth })

  // GET /accounts?companyId=
  .use(requirePermission("accounts", "read"))
  .get("/", async ({ query }) => {
    return await getAccountsWithBalances(query.companyId);
  }, {
    query: t.Object({
      companyId: t.String()
    })
  })

  // POST /accounts
  .use(requirePermission("accounts", "create"))
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const id = await addAccount({
          companyId:     body.companyId,
          code:          body.code,
          name:          body.name,
          accountType:   body.accountType as "asset" | "liability" | "equity" | "revenue" | "expense",
          normalBalance: body.normalBalance as "debit" | "credit",
          parentCode:    body.parentCode ?? null,
          taxCategory:   body.taxCategory ?? null,
          description:   body.description ?? null,
        });
        set.status = 201;
        return { id, message: "Account created" };
      } catch (err) {
        set.status = 422;
        return { error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    {
      body: t.Object({
        companyId:     t.String(),
        code:          t.String({ minLength: 4, maxLength: 6 }),
        name:          t.String({ minLength: 1 }),
        accountType:   t.Union([t.Literal("asset"), t.Literal("liability"), t.Literal("equity"), t.Literal("revenue"), t.Literal("expense")]),
        normalBalance: t.Union([t.Literal("debit"), t.Literal("credit")]),
        parentCode:    t.Optional(t.String()),
        taxCategory:   t.Optional(t.String()),
        description:   t.Optional(t.String()),
      }),
    }
  )

  // DELETE /accounts/:id?companyId=
  .delete("/:id", async ({ params, query, set }) => {
    try {
      await deactivateAccount((params.id as string), query.companyId);
      return { message: "Account deactivated" };
    } catch (err) {
      set.status = 422;
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  }, {
    query: t.Object({
      companyId: t.String()
    })
  });

