import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { answer, precheckPlugin } from "./precheck.test-helper.ts";
import { precheckOrigin } from "./precheck-origin.ts";

verifies("runtime.precheck-action", () => {
  describe("the precheckUrl setting", () => {
    test("is the default when empty, and keeps only the origin of a bare address", () => {
      expect(precheckOrigin({})).toEqual({ origin: "http://halonic-precheck:8787" });
      expect(precheckOrigin({ precheckUrl: "  " })).toEqual({
        origin: "http://halonic-precheck:8787",
      });
      expect(precheckOrigin({ precheckUrl: "https://precheck.acme.test:8443/" })).toEqual({
        origin: "https://precheck.acme.test:8443",
      });
    });

    test("refuses another scheme, a user or password, a path, a query and a fragment", () => {
      const refusals: [string, string][] = [
        ["file:precheck.json", "it must start with http:// or https://"],
        ["ftp://precheck.acme.test", "it must start with http:// or https://"],
        ["https://user:pw@precheck.acme.test", "it must not hold a user or a password"],
        ["http://@precheck.acme.test", "it must not hold a user or a password"],
        ["http://precheck.acme.test/x", "it must not hold a path"],
        ["http://precheck.acme.test?x=1", "it must not hold a query"],
        ["http://precheck.acme.test/?", "it must not hold a query"],
        ["http://precheck.acme.test#x", "it must not hold a fragment"],
        ["http://precheck.acme.test#", "it must not hold a fragment"],
      ];
      for (const [precheckUrl, problem] of refusals) {
        expect(precheckOrigin({ precheckUrl })).toEqual({
          refused: `the plugin's precheckUrl setting is refused: ${problem}`,
        });
      }
      expect(precheckOrigin({ precheckUrl: "not an address" })).toEqual({
        refused: "the plugin's precheckUrl setting isn't an address",
      });
    });

    test("sends requests only to the set origin, and none with a refused one", async () => {
      const set = precheckPlugin([answer(202, { id: "0123456789ab", status: "running" })], {
        config: { precheckUrl: "https://precheck.acme.test:8443" },
      });
      await set.call("ready_for_review", { branch: "mateo/HAL-1-x" });
      expect(set.requests[0]?.url).toBe("https://precheck.acme.test:8443/check");

      const refused = precheckPlugin([], {
        config: { precheckUrl: "http://precheck.acme.test/x" },
      });
      const result = await refused.call("ready_for_review", { branch: "mateo/HAL-1-x" });
      expect(result.content).toBe(
        "CHECK UNAVAILABLE: the plugin's precheckUrl setting is refused: it must not hold a path. Go on without it: open or update the pull request as usual and let CI decide.",
      );
      expect(refused.requests).toEqual([]);
    });
  });
});
