import { describe, it } from "vitest";

describe("audit chain", () => {
  it.todo(
    "verify empty chain is valid (requires DB - integration test)"
  );
  it.todo(
    "verify chain integrity across multiple entries (requires DB)"
  );
  it.todo(
    "reject tampered entry in chain (requires DB)"
  );
  it.todo(
    "reject UPDATE on audit_logs via DB trigger (requires DB)"
  );
  it.todo(
    "reject DELETE on audit_logs via DB trigger (requires DB)"
  );
});
