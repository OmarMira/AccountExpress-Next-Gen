import { rawDb } from "../src/db/connection.ts";

const usersCount = rawDb.query("SELECT COUNT(*) as c FROM users").get() as { c: number };
const comps = rawDb.query("SELECT id, legal_name FROM companies").all() as { id: string, legal_name: string }[];

console.log(`Usuarios totales: ${usersCount.c}`);
console.log(`Empresas totales: ${comps.length}`);
comps.forEach(c => console.log(` - ${c.legal_name} (${c.id})`));
