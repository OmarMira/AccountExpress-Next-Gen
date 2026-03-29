import postgres from "postgres";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

async function main() {
  const envPath = join(process.cwd(), ".env");
  const envContent = readFileSync(envPath, "utf8");
  
  // 1. Generate 32-char random secure password (using hex for 16 bytes = 32 chars)
  const newPassword = randomBytes(16).toString("hex");
  
  // 2. Get current admin URL to connect
  const adminUrlMatch = envContent.match(/DATABASE_ADMIN_URL=(postgresql:\/\/postgres:(.*?)@localhost:5432\/bookkeeping)/);
  if (!adminUrlMatch) {
    console.error("Could not find DATABASE_ADMIN_URL in .env");
    process.exit(1);
  }
  const currentAdminUrl = adminUrlMatch[1];
  
  const sql = postgres(currentAdminUrl);
  
  try {
    // 3. Alter user in DB
    process.stdout.write("Rotating password in database... ");
    await sql.unsafe(`ALTER USER postgres WITH PASSWORD '${newPassword}'`);
    console.log("OK");
    
    // 4. Update .env
    process.stdout.write("Updating .env file... ");
    const newAdminUrl = `DATABASE_ADMIN_URL=postgresql://postgres:${newPassword}@localhost:5432/bookkeeping`;
    const updatedEnvContent = envContent.replace(/DATABASE_ADMIN_URL=.*/, newAdminUrl);
    writeFileSync(envPath, updatedEnvContent);
    console.log("OK");
    
    // 5. Final confirmation query (using the new client would confirm it works)
    const newSql = postgres(newAdminUrl);
    const result = await newSql`SELECT usename FROM pg_user WHERE usename='postgres'`;
    console.log("\nConfirmation query result:");
    console.log(JSON.stringify(result, null, 2));
    await newSql.end();

  } catch (err) {
    console.error("\nFAILED during rotation:");
    // DO NOT print err.message if it might contain the password (unsafe query might include it in some drivers)
    console.error("Error occurred while rotating credentials."); 
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
