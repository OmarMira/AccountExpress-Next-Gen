import { db } from '../src/db/connection.ts'; 
import { companies } from '../src/db/schema/index.ts'; 
import { ilike } from 'drizzle-orm'; 

async function check() {
  const res = await db.select().from(companies).where(ilike(companies.legalName, '%Antigravity%')); 
  console.log('Result:', JSON.stringify(res, null, 2)); 
  process.exit(0);
}

check();
