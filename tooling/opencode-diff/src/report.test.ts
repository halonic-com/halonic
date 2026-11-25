import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { changeBetween, formatReport, type VersionFacts } from "./report.ts";

const old: VersionFacts = {
  version: "2.3.0",
  integrity: "sha512-old",
  envNames: ["OPENCODE_DB", "OPENCODE_DISABLE_FFF"],
  schemaKeys: ["config.js: share", "config.js: update"],
};

verifies("tooling-opencode-diff.diff", () => {
  describe("changeBetween", () => {
    it("names what only the new list has and what only the old one has", () => {
      expect(changeBetween(["b", "a"], ["c", "a"])).toEqual({ added: ["c"], removed: ["b"] });
    });
  });

  describe("formatReport", () => {
    it("lists the added and removed names and keys as Markdown", () => {
      const next: VersionFacts = {
        version: "2.4.0",
        integrity: "sha512-new",
        envNames: ["OPENCODE_DB", "OPENCODE_DISABLE_PROMPT", "OPENCODE_DISABLE_FFF"],
        schemaKeys: ["config.js: update"],
      };
      expect(formatReport(old, next)).toBe(
        [
          "## OpenCode 2.3.0 → 2.4.0",
          "",
          "Program package integrity: `sha512-old` → `sha512-new`",
          "",
          "### `OPENCODE_*` environment names",
          "",
          "Added:",
          "",
          "- `OPENCODE_DISABLE_PROMPT`",
          "",
          "### Config schema keys",
          "",
          "Removed:",
          "",
          "- `config.js: share`",
          "",
        ].join("\n"),
      );
    });

    it("says when nothing changed, with the new version's count", () => {
      const report = formatReport(old, { ...old, version: "2.3.1" });
      expect(report).toContain(
        "### `OPENCODE_*` environment names\n\nNo change (2 in the new version).",
      );
      expect(report).toContain("### Config schema keys\n\nNo change (2 in the new version).");
    });
  });
});
