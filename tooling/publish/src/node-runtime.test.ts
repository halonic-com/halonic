import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkNodeRuntime, newerSecurityRelease, pinnedNodeRuntime } from "./node-runtime.ts";

// The head of Node's release list on 26 Nov 2026, plus a newer major line.
const releases = [
  { version: "v27.0.1", security: true },
  { version: "v26.13.1", security: true },
  { version: "v26.13.0", security: false },
  { version: "v26.12.1", security: true },
  { version: "v26.12.0", security: false },
];

verifies("publish.node-runtime", () => {
  describe("newerSecurityRelease", () => {
    it("fails 26.13.0, which misses the 26.13.1 security release", () => {
      expect(newerSecurityRelease("26.13.0", releases)?.version).toBe("v26.13.1");
    });

    it("passes 26.13.1, the newest security release of its line", () => {
      expect(newerSecurityRelease("26.13.1", releases)).toBeUndefined();
    });

    it("names the newest of several missed security releases", () => {
      expect(newerSecurityRelease("26.12.0", releases)?.version).toBe("v26.13.1");
    });

    it("ignores newer releases without security fixes and newer major lines", () => {
      const list = [
        { version: "v27.0.1", security: true },
        { version: "v26.14.0", security: false },
      ];
      expect(newerSecurityRelease("26.13.1", list)).toBeUndefined();
    });

    it("skips entries whose version it can't read", () => {
      expect(newerSecurityRelease("26.13.1", [{ version: "nightly", security: true }])).toBe(
        undefined,
      );
    });

    it("refuses a pin that is not a version", () => {
      expect(() => newerSecurityRelease("latest", releases)).toThrow(/not a Node version/);
    });
  });

  describe("checkNodeRuntime", () => {
    const lockfile = (version: string) => `packages:\n  node@runtime:${version}:\n`;

    it("fails the release on 26.13.0 and names the missed release", async () => {
      const result = await checkNodeRuntime(lockfile("26.13.0"), async () => releases);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/^::error::Node v26\.13\.1 is a security release/);
    });

    it("passes the release on 26.13.1", async () => {
      expect(await checkNodeRuntime(lockfile("26.13.1"), async () => releases)).toEqual({
        ok: true,
        message: "Bundled Node 26.13.1 has every security release of its line.",
      });
    });

    it("warns and passes when Node's release list can't be read", async () => {
      const offline = await checkNodeRuntime(lockfile("26.13.0"), async () => {
        throw new Error("fetch failed");
      });
      expect(offline.ok).toBe(true);
      expect(offline.message).toMatch(/^::warning::.*\(fetch failed\)/);
      const odd = await checkNodeRuntime(lockfile("26.13.0"), async () => ({ error: "busy" }));
      expect(odd.ok).toBe(true);
      expect(odd.message).toMatch(/not a list/);
    });

    it("fails when the lockfile has no Node runtime", async () => {
      const result = await checkNodeRuntime("packages:\n", async () => releases);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/no node@runtime entry/);
    });
  });

  describe("pinnedNodeRuntime", () => {
    it("reads the node@runtime version from the lockfile's packages", () => {
      const lockfile = [
        "packages:",
        "  node-releases@2.0.63:",
        "    resolution: {}",
        "  node@runtime:26.13.1:",
        "    resolution:",
        "      type: variations",
      ].join("\n");
      expect(pinnedNodeRuntime(lockfile)).toBe("26.13.1");
    });

    it("finds none in a lockfile without a Node runtime", () => {
      expect(pinnedNodeRuntime("packages:\n  node-releases@2.0.63:\n")).toBeUndefined();
    });
  });
});
