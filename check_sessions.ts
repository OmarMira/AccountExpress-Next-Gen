
import { db } from "./src/db/connection";
import { sessions } from "./src/db/schema";

async function main() {
  const allSessions = await db.select().from(sessions);
  console.log(JSON.stringify(allSessions, null, 2));
  process.exit(0);
}

main();
