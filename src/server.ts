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
import { bankRulesRouter }    from "./routes/bank-rules.routes.ts";
import { journalRoutes }       from "./routes/journal.routes.ts";
import { fiscalPeriodsRoutes } from "./routes/fiscal-periods.routes.ts";
import { auditRoutes }         from "./routes/audit.routes.ts";
import { bankRoutes }          from "./routes/bank.routes.ts";
import { reportsRoutes }       from "./routes/reports.routes.ts";
import { glAccountsRoutes }    from "./routes/gl-accounts.routes.ts";
import { dashboardRoutes }     from "./routes/dashboard.routes.ts";
import { usersRoutes }         from "./routes/users.routes.ts";
import { diagnosticsRoutes }   from "./routes/diagnostics.routes.ts";
import { backupRoutes, backupScheduler } from "./api/routes/backup.routes.ts";
import { reconciliationGroupRoutes } from "./routes/reconciliation-group.routes.ts";
import { movementSummaryRoutes }     from "./routes/movement-summary.routes.ts";
import { aiRoutes }                  from "./routes/ai.routes.ts";
import { globalRateLimiter } from "./middleware/rate-limit.ts";
import { logger } from "./lib/logger.ts";
import { AppError } from "./lib/errors.ts";

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
    .use(fiscalPeriodsRoutes)
    .use(auditRoutes)
    .use(bankRoutes)
    .use(bankAccountsRoutes)
    .use(bankRulesRouter)
    .use(reportsRoutes)
    .use(glAccountsRoutes)
    .use(dashboardRoutes)
    .use(usersRoutes)
    .use(diagnosticsRoutes)
    .use(backupRoutes)
    .use(reconciliationGroupRoutes)
    .use(movementSummaryRoutes)
    .use(aiRoutes)
  )

  // ── Error handler ──────────────────────────────────────────
  .onError(({ code, error, set }) => {
    // 1. Manejar errores explícitos del sistema (AppError)
    if (error instanceof AppError) {
      set.status = error.status;
      return { 
        success: false, 
        error: error.message, 
        code: error.code,
        detail: error.detail 
      };
    }

    // 2. Manejar errores de validación nativos de Elysia
    if (code === 'VALIDATION') {
      set.status = 422;
      return { 
        success: false, 
        error: 'Validación de datos fallida', 
        code: 'VALIDATION_ERROR',
        detail: error.message 
      };
    }

    // 3. Manejar error 404 nativo
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { 
        success: false, 
        error: 'Recurso no encontrado', 
        code: 'NOT_FOUND' 
      };
    }

    // 4. Fallback para errores desconocidos
    const message = error instanceof Error ? error.message : String(error);
    const stack   = error instanceof Error ? error.stack   : undefined;

    logger.error("server", "Unhandled error", {
      code,
      message,
      stack
    });

    set.status = 500;
    return { 
      success: false, 
      error: "Error interno del servidor", 
      code: "INTERNAL_SERVER_ERROR" 
    };
  });

// Only start listening if this is the entry point
if (import.meta.main) {
  app.listen(PORT);
  
  await backupScheduler.start();
  logger.info("server", "Backup scheduler active");
  logger.info("server", "Next automatic backup scheduled", { nextBackup: await backupScheduler.getNextBackupTime() });
  
  logger.info("server", "Account Express Bookkeeping Core running", { url: `http://localhost:${PORT}` });
}
