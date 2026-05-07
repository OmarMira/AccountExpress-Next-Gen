import { pgClient } from "./src/db/connection.ts";

async function main() {
  console.log("Forcing creation of rule_mappings...");
  try {
    await pgClient`CREATE TABLE IF NOT EXISTS rule_mappings (
      id text PRIMARY KEY,
      pattern text NOT NULL,
      gl_account_code text NOT NULL,
      company_id text REFERENCES companies(id),
      is_global boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );`;
    await pgClient`CREATE INDEX IF NOT EXISTS idx_rule_mappings_pattern ON rule_mappings (pattern);`;
    await pgClient`CREATE INDEX IF NOT EXISTS idx_rule_mappings_company ON rule_mappings (company_id, is_global);`;
    console.log("Table created.");
  } catch (e) {
    console.error("Failed:", e);
  } finally {
    process.exit(0);
  }
}

main();
