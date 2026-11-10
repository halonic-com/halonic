import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { formatVersion, isAtLeast, readLeadingVersion } from "./version.ts";

verifies("harness-claude-code.detect", () => {
  describe("readLeadingVersion", () => {
    it.each([
      ["2.1.321 (Claude Code)", { major: 2, minor: 1, patch: 321 }],
      ["  2.1.321 (Claude Code)\n", { major: 2, minor: 1, patch: 321 }],
      ["10.0.7", { major: 10, minor: 0, patch: 7 }],
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

  describe("isAtLeast", () => {
    const minimum = { major: 2, minor: 1, patch: 311 };

    it.each([
      ["2.1.311", true],
      ["2.1.312", true],
      ["2.2.0", true],
      ["3.0.0", true],
      ["2.1.310", false],
      ["2.0.999", false],
      ["1.9.999", false],
    ])("%s against 2.1.311 is %s", (text, expected) => {
      const version = readLeadingVersion(text);
      expect(version && isAtLeast(version, minimum)).toBe(expected);
    });
  });

  it("writes a version back as text", () => {
    expect(formatVersion({ major: 2, minor: 1, patch: 321 })).toBe("2.1.321");
  });
});
