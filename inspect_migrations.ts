import { pgClient } from "./src/db/connection.ts";

async function main() {
  const rows = await pgClient`SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;`;
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

main();
