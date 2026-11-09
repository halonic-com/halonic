import type { Digest } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { runExample } from "../examples/find-the-runs-folder.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

describe("the README example", () => {
  it("gives the folders its comments promise", async () => {
    const result = await runExample(digest);
    expect(result.profile).toBe("/srv/acme/data/halonic");
    expect(result.runs).toMatch(/^\/srv\/acme\/data\/halonic\/workspaces\/[0-9a-f]{32}\/runs$/);
    expect(result.stagingRuns).toBe(result.runs.replace(/runs$/, "deployments/staging/runs"));
  });
});
