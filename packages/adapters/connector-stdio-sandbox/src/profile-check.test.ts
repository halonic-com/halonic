import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { testProfile } from "./fake-mcp-program.spec.ts";
import { profileDifferences } from "./profile-check.ts";

verifies("connector-stdio-sandbox.local-tool-profile", () => {
  describe("profileDifferences", () => {
    it("finds no difference between a profile and itself", () => {
      expect(profileDifferences(testProfile, structuredClone(testProfile))).toEqual([]);
    });

    it("names each field that differs, and each variable by its name only", () => {
      const actual = {
        ...testProfile,
        env: { ...testProfile.env, ACME_TOKEN: "leaked-value", PATH: "/other/bin" },
        network: { bridge: null, allowedSites: ["*.example.test"] },
        deniedPaths: [],
      };
      const differences = profileDifferences(actual, testProfile);
      expect(differences).toEqual(["deniedPaths", "env.ACME_TOKEN", "env.PATH", "network"]);
      expect(differences.join(" ")).not.toContain("leaked-value");
    });
  });
});
