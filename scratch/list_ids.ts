import { db } from '../src/db/connection.ts';
import { companies } from '../src/db/schema/index.ts';

async function run() {
  const res = await db.select({id: companies.id, name: companies.legalName}).from(companies);
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}
run();
