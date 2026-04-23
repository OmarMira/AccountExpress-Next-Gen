
import { db } from "./src/db/connection";
import { companies, bankTransactions, sessions } from "./src/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  const companyCount = await db.select({ count: sql`count(*)` }).from(companies);
  const txCount = await db.select({ count: sql`count(*)` }).from(bankTransactions);
  const sessionCount = await db.select({ count: sql`count(*)` }).from(sessions);
  
  console.log('COMPANIES:', companyCount[0].count);
  console.log('BANK TRANSACTIONS:', txCount[0].count);
  console.log('SESSIONS:', sessionCount[0].count);
  
  process.exit(0);
}

main();
