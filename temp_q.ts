import Database from "bun:sqlite";
const db = new Database("data/bookkeeping.sqlite");
const rows = db.query("SELECT id, name FROM companies LIMIT 5;").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
