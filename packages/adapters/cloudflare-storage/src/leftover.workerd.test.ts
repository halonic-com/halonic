// Runs inside workerd: proves a test file's bucket starts empty. Two test files run this same
// suite; if the first one's object survived into the second one's workerd, the second fails.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const sentinelKey = "left-by-another-test-file";

// One case, not two: Vitest shuffles cases, and the bucket must be checked before the write.
describe("a test file's R2 bucket", () => {
  it("starts empty, whatever other test files wrote, and keeps what this one writes", async () => {
    const before = await env.BLOBS.list();
    expect(before.objects.map((object) => object.key)).toEqual([]);

    await env.BLOBS.put(sentinelKey, "written by this test file");
    const after = await env.BLOBS.list();
    expect(after.objects.map((object) => object.key)).toEqual([sentinelKey]);
  });
});
