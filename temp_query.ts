import { db } from './src/db/connection';
import { companies } from './src/db/schema';
const r = await db.select({ id: companies.id, name: companies.name }).from(companies);
console.log(JSON.stringify(r, null, 2));
