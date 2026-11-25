import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readEnvNames } from "./env-names.ts";

function program(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

verifies("tooling-opencode-diff.diff", () => {
  describe("readEnvNames", () => {
    it("finds each OPENCODE_* name once, sorted", () => {
      const text = "\u0000OPENCODE_DB\u0000x OPENCODE_CONFIG_DIR=1 OPENCODE_DB OPENAI_KEY";
      expect(readEnvNames(program(text))).toEqual(["OPENCODE_CONFIG_DIR", "OPENCODE_DB"]);
    });

    it("splits names the program's text runs together", () => {
      const text =
        "\u0001OPENCODE_PTY_SOCKET_DIROPENCODE_PTY_SOCKET_DIR\u0000OPENCODE_DBOPENCODE_ZED_DB";
      expect(readEnvNames(program(text))).toEqual([
        "OPENCODE_DB",
        "OPENCODE_PTY_SOCKET_DIR",
        "OPENCODE_ZED_DB",
      ]);
    });

    it("finds a name between bytes that aren't text", () => {
      const bytes = new Uint8Array([0xff, 0xfe, ...program("OPENCODE_DISABLE_FFF"), 0xc3]);
      expect(readEnvNames(bytes)).toEqual(["OPENCODE_DISABLE_FFF"]);
    });
  });
});
