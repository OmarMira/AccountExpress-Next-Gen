// Sets DATABASE_URL BEFORE bun test spawns — avoids ESM hoisting issue
import { spawnSync } from "bun";

const testUrl = process.env.DATABASE_TEST_URL;
if (!testUrl) {
  console.error("ERROR: DATABASE_TEST_URL is not set in .env");
  process.exit(1);
}

console.log("Running integration tests against:", testUrl);

const result = spawnSync(
  ["bun", "test", "tests/integration/"],
  {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdout: "inherit",
    stderr: "inherit",
  }
);

process.exit(result.exitCode ?? 1);
