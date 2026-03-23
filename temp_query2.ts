import { Database } from "bun:sqlite";
const db = new Database("data/bookkeeping.sqlite");
const companies = db.query("SELECT id, name FROM companies").all();
console.log(JSON.stringify(companies, null, 2));
