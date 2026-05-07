import { pgClient } from "./src/db/connection.ts";

async function main() {
  console.log("Cleaning up rule_mappings...");
  try {
    await pgClient`DROP TABLE IF EXISTS rule_mappings CASCADE;`;
    await pgClient`DELETE FROM drizzle.__drizzle_migrations WHERE name = '0012_rule_mappings';`;
    console.log("Cleanup done.");
  } catch (e) {
    console.error("Cleanup failed:", e);
  } finally {
    process.exit(0);
  }
}

main();
