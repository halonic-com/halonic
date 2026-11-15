import type { InstructionPin } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { instructionTrust } from "./instruction-trust.ts";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

/** A pin of the files given (name to the digest's letter). The set's digest differs whenever the files do. */
function pinOf(files: Record<string, string>): InstructionPin {
  const listing = Object.entries(files)
    .map(([name, letter]) => `${name}=${letter}`)
    .join(",");
  return {
    digest: `${digest("0")}#${listing}`,
    files: Object.fromEntries(
      Object.entries(files).map(([name, letter]) => [name, digest(letter)]),
    ),
  };
}

verifies("app.instruction-trust", () => {
  describe("instructionTrust", () => {
    it("trusts the same set", () => {
      const pin = pinOf({ "AGENTS.md": "a", "skills/review/SKILL.md": "b" });
      expect(instructionTrust(pin, pin)).toEqual({ kind: "trusted" });
    });

    it("asks when nothing is trusted yet, naming every file as added", () => {
      expect(instructionTrust(null, pinOf({ "AGENTS.md": "a" }))).toEqual({
        kind: "ask",
        hadTrusted: false,
        changes: { added: ["AGENTS.md"], removed: [], changed: [] },
      });
    });

    it("asks again, naming what was added, removed and changed", () => {
      const trusted = pinOf({ "AGENTS.md": "a", "skills/review/SKILL.md": "b" });
      const current = pinOf({ "AGENTS.md": "c", "skills/new/SKILL.md": "d" });
      expect(instructionTrust(trusted, current)).toEqual({
        kind: "ask",
        hadTrusted: true,
        changes: {
          added: ["skills/new/SKILL.md"],
          removed: ["skills/review/SKILL.md"],
          changed: ["AGENTS.md"],
        },
      });
    });

    it("treats a file named like an object method as added, not changed", () => {
      const answer = instructionTrust(pinOf({ "AGENTS.md": "a" }), pinOf({ constructor: "b" }));
      expect(answer).toMatchObject({
        kind: "ask",
        changes: { added: ["constructor"], changed: [] },
      });
    });

    it("lists a dropped file named like an object method as removed", () => {
      const answer = instructionTrust(pinOf({ constructor: "b" }), pinOf({ "AGENTS.md": "a" }));
      expect(answer).toMatchObject({ kind: "ask", changes: { removed: ["constructor"] } });
    });
  });
});
