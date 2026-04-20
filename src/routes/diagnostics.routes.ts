// ============================================================
// DIAGNOSTICS ROUTES
// System health checks and repair tools.
// Exclusively for SuperAdministrators.
// ============================================================

import { Elysia, t } from "elysia";
import { authMiddleware, requireAuth } from "../middleware/auth.middleware.ts";
import { db } from "../db/connection.ts";
import { users } from "../db/schema/index.ts";
import { eq } from "drizzle-orm";
import { checkAllDiagnostics, repairDiagnostic } from "../services/diagnostics.service.ts";

export const diagnosticsRoutes = new Elysia({ prefix: "/diagnostics" })
  .use(authMiddleware)
  .guard({
    beforeHandle: [
      requireAuth,
      async ({ user, set }) => {
        const [dbUser] = await db
          .select({ isSuperAdmin: users.isSuperAdmin })
          .from(users)
          .where(eq(users.id, user!))
          .limit(1);

        if (!dbUser?.isSuperAdmin) {
          set.status = 403;
          return { success: false, error: "Forbidden: Super Admin privileges required" };
        }
      }
    ]
  })

  // ── GET /diagnostics/check ──────────────────────────────────
  .get("/check", async () => {
    try {
      const results = await checkAllDiagnostics();
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })

  // ── POST /diagnostics/repair/:id ────────────────────────────
  .post("/repair/:id", async ({ params }) => {
    const result = await repairDiagnostic(params.id);
    return result;
  }, {
    params: t.Object({
      id: t.String()
    })
  })

  // ── POST /diagnostics/repair-all ────────────────────────────
  .post("/repair-all", async () => {
    const checks = await checkAllDiagnostics();
    const results = [];
    
    for (const item of checks) {
      if (item.status === 'error' && item.canRepair) {
        const res = await repairDiagnostic(item.id);
        results.push({ id: item.id, ...res });
      }
    }

    return { 
      success: true, 
      message: "Proceso de reparación global finalizado.",
      results 
    };
  });
