import { db, sql } from "../src/db/connection.ts";
import { users, companies } from "../src/db/schema/index.ts";

const [usersCountResult] = await db.execute(sql`SELECT COUNT(*)::int as c FROM users`);
const comps = await db.select({ id: companies.id, legalName: companies.legalName }).from(companies);

console.log(`Usuarios totales: ${usersCountResult.c}`);
console.log(`Empresas totales: ${comps.length}`);
comps.forEach(c => console.log(` - ${c.legalName} (${c.id})`));
