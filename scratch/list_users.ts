import { db } from "../src/db/connection.ts";
import { users } from "../src/db/schema/index.ts";

async function main() {
  const allUsers = await db.select({
    username: users.username,
    isSuperAdmin: users.isSuperAdmin
  }).from(users);
  
  console.log(JSON.stringify(allUsers, null, 2));
  process.exit(0);
}

main();
