// ============================================================
// ELYSIA SERVER
// Main application — registers all routes and plugins.
// ============================================================

import { Elysia } from "elysia";
import { cookie } from "@elysiajs/cookie";
import { cors } from "@elysiajs/cors";
import { authRoutes }          from "./routes/auth.routes.ts";
import { bankAccountsRoutes } from './routes/bank-accounts.routes.ts';
import { companiesRoutes }     from "./routes/companies.routes.ts";
import { journalRoutes }       from "./routes/journal.routes.ts";
import { accountsRoutes }      from "./routes/accounts.routes.ts";
import { fiscalPeriodsRoutes } from "./routes/fiscal-periods.routes.ts";
import { auditRoutes }         from "./routes/audit.routes.ts";
import { bankRoutes }          from "./routes/bank.routes.ts";
import { reportsRoutes }       from "./routes/reports.routes.ts";
import { backupRoutes, backupScheduler } from "./api/routes/backup.routes.ts";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

export const app = new Elysia()
  .use(cors({
    origin: process.env["CORS_ORIGIN"] ?? "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }))
  .use(cookie())

  // ── Health check ──────────────────────────────────────────
  .get("/health", () => ({
    status:  "ok",
    name:    process.env["APP_NAME"] ?? "Account Express Bookkeeping Core",
    version: "1.0.0",
    time:    new Date().toISOString(),
  }))

  // ── Route groups ──────────────────────────────────────────
  .group("/api", (app) => app
    .use(authRoutes)
    .use(companiesRoutes)
    .use(journalRoutes)
    .use(accountsRoutes)
    .use(fiscalPeriodsRoutes)
    .use(auditRoutes)
    .use(bankRoutes)
    .use(bankAccountsRoutes)
    .use(reportsRoutes)
    .use(backupRoutes)
  )

  // ── 404 handler ───────────────────────────────────────────
  .onError(({ code, error, set }) => {
    if ((code as string) === "NOT_FOUND") {
      set.status = 404;
      return { error: "Route not found" };
    }
    console.error("[SERVER] Unhandled error:", error);
    set.status = 500;
    return { error: "Internal server error" };
  });

// Only start listening if this is the entry point
if (import.meta.main) {
  app.listen(PORT);
  
  await backupScheduler.start();
  console.log('✅ Backup scheduler activo');
  console.log(`   Próximo backup automático: ${await backupScheduler.getNextBackupTime()}`);
  
  console.log(
    `\n✅ Account Express Bookkeeping Core running on http://localhost:${PORT}\n`
  );
}
