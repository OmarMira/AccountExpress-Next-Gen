// ============================================================
// APPLICATION BOOTSTRAPPER
// Execution order: migrate → seed → start server
// ============================================================

import "./config/validate.ts"; // Side-effect: validates process.env immediately

import { runMigrations } from "./db/migrate.ts";
import { runSeed }       from "./db/seed/seed.ts";
import { logger } from "./lib/logger.ts";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

logger.info("app", "═══════════════════════════════════════════════════");
logger.info("app", "  Account Express Bookkeeping Core — v1.0.0");
logger.info("app", "═══════════════════════════════════════════════════");

// 1. Run migrations (idempotent)
await runMigrations();

// 2. Run seed (idempotent)
await runSeed();

// 3. Start server
const { app } = await import("./server.ts");
app.listen(PORT);

logger.info("app", "Server ready", { url: `http://localhost:${PORT}` });
logger.info("app", "Health check ready", { url: `http://localhost:${PORT}/health` });

