// ============================================================
// APPLICATION BOOTSTRAPPER
// Execution order: migrate → seed → start server
// ============================================================

import "./config/validate.ts"; // Side-effect: validates process.env immediately

import { runMigrations } from "./db/migrate.ts";
import { runSeed }       from "./db/seed/seed.ts";
import { initAuditChainCache } from "./services/audit.service.ts";
import { logger } from "./lib/logger.ts";
import { validateEnv } from "./config/validate.ts";

// Validate environment before anything else
validateEnv();

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

logger.info("app", "═══════════════════════════════════════════════════");
logger.info("app", "  Account Express Bookkeeping Core — v1.0.0");
logger.info("app", "═══════════════════════════════════════════════════");

// 1. Run migrations (idempotent)
await runMigrations();

// 2. Run seed (idempotent)
await runSeed();

// 3. Initialize Audit Chain Cache (CRITICAL: Step 5 of the report)
await initAuditChainCache();
logger.info("app", "Audit chain cache initialized");

// 4. Start server
const { app } = await import("./server.ts");
app.listen(PORT);

logger.info("app", "Server ready", { url: `http://localhost:${PORT}` });
logger.info("app", "Health check ready", { url: `http://localhost:${PORT}/health` });

