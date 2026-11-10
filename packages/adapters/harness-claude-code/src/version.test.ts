import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readLeadingVersion } from "./version.ts";

verifies("harness-claude-code.detect", () => {
  describe("readLeadingVersion", () => {
    it.each([
      ["2.1.321 (Claude Code)", { major: 2, minor: 1, patch: 321, prerelease: [] }],
      ["  2.1.321 (Claude Code)\n", { major: 2, minor: 1, patch: 321, prerelease: [] }],
      ["10.0.7", { major: 10, minor: 0, patch: 7, prerelease: [] }],
    ])("reads %j", (output, version) => {
      expect(readLeadingVersion(output)).toEqual(version);
    });

    it.each(["", "Claude Code 2.1.321", "v2.1.321", "2.1", "2.1.321.4"])(
      "reads no version in %j",
      (output) => {
        expect(readLeadingVersion(output)).toBeUndefined();
      },
    );
  });
});
