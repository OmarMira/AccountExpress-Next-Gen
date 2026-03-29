// ============================================================
// APPLICATION BOOTSTRAPPER
// Execution order: migrate → seed → start server
// ============================================================

import "./config/validate.ts"; // Side-effect: validates process.env immediately

import { runMigrations } from "./db/migrate.ts";
import { runSeed }       from "./db/seed/seed.ts";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

console.log("\n═══════════════════════════════════════════════════");
console.log("  Account Express Bookkeeping Core — v1.0.0");
console.log("═══════════════════════════════════════════════════\n");

// 1. Run migrations (idempotent)
await runMigrations();

// 2. Run seed (idempotent)
await runSeed();

// 3. Start server
const { app } = await import("./server.ts");
app.listen(PORT);

console.log(`\n✅ Server ready: http://localhost:${PORT}`);
console.log(`   Health check: http://localhost:${PORT}/health\n`);

