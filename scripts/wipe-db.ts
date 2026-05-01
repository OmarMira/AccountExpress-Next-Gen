import postgres from "postgres";
import { config } from "dotenv";
config();

// ⚠️ DANGER: This script destroys ALL data. Blocked in production.
if (process.env.NODE_ENV === "production") {
  console.error("❌ BLOCKED: wipe-db cannot run in a production environment.");
  process.exit(1);
}

async function wipe() {
  const connectionString = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No database URL provided.");
    process.exit(1);
  }

  const sql = postgres(connectionString);

  try {
    console.log("Wiping database schema...");
    await sql`DROP SCHEMA public CASCADE;`;
    await sql`CREATE SCHEMA public;`;
    await sql`GRANT ALL ON SCHEMA public TO postgres;`;
    await sql`GRANT ALL ON SCHEMA public TO public;`;
    console.log("Database wiped successfully.");
  } catch (err) {
    console.error("Error wiping database:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

wipe();
