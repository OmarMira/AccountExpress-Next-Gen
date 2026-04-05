// ============================================================
// ELYSIA SERVER
// Main application — registers all routes and plugins.
// ============================================================

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { authMiddleware } from "./middleware/auth.middleware.ts";
import { authRoutes }          from "./routes/auth.routes.ts";
import { bankAccountsRoutes } from './routes/bank-accounts.routes.ts';
import { companiesRoutes }     from "./routes/companies.routes.ts";
import { journalRoutes }       from "./routes/journal.routes.ts";
import { accountsRoutes }      from "./routes/accounts.routes.ts";
import { fiscalPeriodsRoutes } from "./routes/fiscal-periods.routes.ts";
import { auditRoutes }         from "./routes/audit.routes.ts";
import { bankRoutes }          from "./routes/bank.routes.ts";
import { reportsRoutes }       from "./routes/reports.routes.ts";
import { glAccountsRoutes }    from "./routes/gl-accounts.routes.ts";
import { dashboardRoutes }     from "./routes/dashboard.routes.ts";
import { usersRoutes }         from "./routes/users.routes.ts";
import { aiRoutes }            from "./routes/ai.routes.ts";
import { backupRoutes, backupScheduler } from "./api/routes/backup.routes.ts";
import { reconciliationGroupRoutes } from "./routes/reconciliation-group.routes.ts";
import { globalRateLimiter } from "./middleware/rate-limit.ts";
import { logger } from "./lib/logger.ts";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

export const app = new Elysia()
  .use(cors({
    origin: process.env["CORS_ORIGIN"] ?? "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }))

  // ── Health check ──────────────────────────────────────────
  .get("/health", () => ({
    status:  "ok",
    name:    process.env["APP_NAME"] ?? "Account Express Bookkeeping Core",
    version: "1.0.0",
    time:    new Date().toISOString(),
  }))

  .group("/api", (app) => app
    .onBeforeHandle(globalRateLimiter(100, 60 * 1000))
    .use(authMiddleware)
    .use(authRoutes)
    .use(companiesRoutes)
    .use(journalRoutes)
    .use(accountsRoutes)
    .use(fiscalPeriodsRoutes)
    .use(auditRoutes)
    .use(bankRoutes)
    .use(bankAccountsRoutes)
    .use(reportsRoutes)
    .use(glAccountsRoutes)
    .use(dashboardRoutes)
    .use(usersRoutes)
    .use(aiRoutes)
    .use(backupRoutes)
    .use(reconciliationGroupRoutes)
  )

  // ── 404 handler ───────────────────────────────────────────
  .onError(({ code, error, set }) => {
    // Definimos los códigos posibles de forma explícita para cubrir todos los casos reales detectados
    type ErrorCode = 
      | 'UNKNOWN' 
      | 'VALIDATION' 
      | 'INTERNAL_SERVER_ERROR' 
      | 'INVALID_FILE_TYPE' 
      | 'INVALID_COOKIE_SIGNATURE'
      | 'PARSE' 
      | 'NOT_FOUND' 
      | number;
    
    const errorCode: ErrorCode = code;

    if (errorCode === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Route not found' };
    }

    if (errorCode === 'VALIDATION') {
      set.status = 400;
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      return { error: 'Validation failed', detail: errorMessage };
    }

    if (errorCode === 'INVALID_FILE_TYPE') {
      set.status = 400;
      return { error: 'Invalid file type' };
    }

    if (errorCode === 'INVALID_COOKIE_SIGNATURE') {
      set.status = 401;
      return { error: 'Invalid session cookie' };
    }

    if (error instanceof Error && error.name === 'ValidationError') {
      set.status = 400;
      return { error: error.message };
    }

    logger.error("server", "Unhandled error", error);
    set.status = 500;
    return { error: "Internal server error" };
  });

// Only start listening if this is the entry point
if (import.meta.main) {
  app.listen(PORT);
  
  await backupScheduler.start();
  logger.info("server", "Backup scheduler active");
  logger.info("server", "Next automatic backup scheduled", { nextBackup: await backupScheduler.getNextBackupTime() });
  
  logger.info("server", "Account Express Bookkeeping Core running", { url: `http://localhost:${PORT}` });
}
