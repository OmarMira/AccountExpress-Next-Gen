
import { db } from "./src/db/connection";
import { bankTransactions, companies } from "./src/db/schema";
import { count, eq } from "drizzle-orm";

async function main() {
  const comps = await db.select().from(companies);
  for (const c of comps) {
    const res = await db.select({ count: count() }).from(bankTransactions).where(eq(bankTransactions.companyId, c.id));
    console.log(`Company ${c.legalName}: ${res[0].count} transactions`);
  }
  process.exit(0);
}

main();
