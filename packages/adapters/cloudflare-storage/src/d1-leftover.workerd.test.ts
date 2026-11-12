// Runs inside workerd: proves a test file's D1 database starts empty. Two test files run this
// same suite; if the first one's table survived into the second one's workerd, the second fails.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// One case, not two: Vitest shuffles cases, and the database must be checked before the write.
describe("a test file's D1 database", () => {
  it("starts empty, whatever other test files wrote, and keeps what this one writes", async () => {
    const before = await env.DB.prepare("SELECT name FROM sqlite_master WHERE name = ?")
      .bind("left_by_another_test_file")
      .all();
    expect(before.results).toEqual([]);

    await env.DB.prepare("CREATE TABLE left_by_another_test_file (id TEXT)").run();
    const after = await env.DB.prepare("SELECT name FROM sqlite_master WHERE name = ?")
      .bind("left_by_another_test_file")
      .all();
    expect(after.results.map((row) => row["name"])).toEqual(["left_by_another_test_file"]);
  });
});
