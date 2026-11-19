import { runnerUnfencedWords } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  ADDRESSES_FENCED,
  ADDRESSES_UNFENCED,
  addressesLine,
  needsUnfencedYes,
  trustLastLine,
} from "./runs-line.ts";
import { TRUST_CHECK_LAST_LINE } from "./trust-text.ts";

const fenced = { state: "fenced" } as const;
const windows = { state: "not-fenced", reason: "windows" } as const;
const backendAndProgram = { backend: true, programs: 1 };
const backendOnly = { backend: true, programs: 0 };
const programsOnly = { backend: false, programs: 2 };

verifies("plugins.plugin-trust-runs-line", () => {
  describe("the last line", () => {
    it("is the board's longer line in the sandbox, with the program sentence only with a program (R1)", () => {
      expect(trustLastLine(fenced, backendAndProgram)).toEqual({
        kind: "plain",
        text: "Plugin code runs apart from Studio and your files, and can only reach the addresses above. Its program runs in the agent sandbox. Halonic doesn't check what the plugin does with what it's given.",
      });
      expect(trustLastLine(fenced, backendOnly)).toEqual({
        kind: "plain",
        text: "Plugin code runs apart from Studio and your files, and can only reach the addresses above. Halonic doesn't check what the plugin does with what it's given.",
      });
    });

    it("is the amber line with the reason's words for a backend outside the sandbox (R2, R3)", () => {
      expect(trustLastLine(windows, backendAndProgram)).toEqual({
        kind: "warning",
        warning:
          "Plugin code runs apart from Studio, but not in the sandbox on this computer, so it may be able to use your files, programs and sign-ins, and reach addresses not listed above.",
        words: runnerUnfencedWords("windows", "plugin"),
        end: "Halonic doesn't check what the plugin does with what it's given.",
      });
    });

    it("stays short for a plugin with only programs, with the program sentence in the sandbox (R2b)", () => {
      expect(trustLastLine(windows, programsOnly)).toEqual({
        kind: "plain",
        text: TRUST_CHECK_LAST_LINE,
      });
      expect(trustLastLine(fenced, programsOnly)).toEqual({
        kind: "plain",
        text: "Plugin code runs apart from Studio. Its program runs in the agent sandbox. Halonic doesn't check what the plugin does with what it's given.",
      });
    });

    it("keeps T9 while checking, when stopped and when the host doesn't say", () => {
      for (const fence of [
        { state: "checking" } as const,
        { state: "stopped" } as const,
        undefined,
      ]) {
        expect(trustLastLine(fence, backendAndProgram)).toEqual({
          kind: "plain",
          text: TRUST_CHECK_LAST_LINE,
        });
      }
    });
  });

  it("says in Addresses which addresses hold: R7 in the sandbox, R8 for a backend outside it", () => {
    expect(addressesLine(fenced, backendOnly)).toBe(ADDRESSES_FENCED);
    expect(addressesLine(windows, backendOnly)).toBe(ADDRESSES_UNFENCED);
    expect(addressesLine(windows, programsOnly)).toBeUndefined();
    expect(addressesLine(undefined, backendOnly)).toBeUndefined();
  });

  describe("the yes", () => {
    it("is asked for a backend outside the sandbox with no saved yes", () => {
      expect(needsUnfencedYes(windows, backendOnly, undefined)).toBe(true);
    });

    it("isn't asked again once saved for this reason, but is for another reason", () => {
      expect(needsUnfencedYes(windows, backendOnly, { reason: "windows", on: "9 Nov" })).toBe(
        false,
      );
      expect(needsUnfencedYes(windows, backendOnly, { reason: "container", on: "9 Nov" })).toBe(
        true,
      );
    });

    it("isn't asked in the sandbox, for a plugin with only programs, or while checking", () => {
      expect(needsUnfencedYes(fenced, backendOnly, undefined)).toBe(false);
      expect(needsUnfencedYes(windows, programsOnly, undefined)).toBe(false);
      expect(needsUnfencedYes({ state: "checking" }, backendOnly, undefined)).toBe(false);
    });
  });
});
