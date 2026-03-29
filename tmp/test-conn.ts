import postgres from "postgres";

async function main() {
  const adminUrl = "postgresql://postgres:33a4a4e793a0fbac9d6ece38020d0ed6@localhost:5432/bookkeeping";
  const sql = postgres(adminUrl);
  
  try {
    const result = await sql`SELECT usename FROM pg_user WHERE usename='postgres'`;
    console.log("Connection successful! Confirmation:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Connection failed.");
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
