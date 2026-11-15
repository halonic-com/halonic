import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type RunRequest, windowsCommandLine } from "./srt-runner.ts";

const request = (overrides: Partial<RunRequest> = {}): RunRequest => ({
  settingsPath: "tools\\s.json",
  program: "tools\\Program Files\\nodejs\\node.exe",
  args: ["tools\\work\\a b.cjs"],
  cwd: "tools\\work",
  launcherEnv: {},
  programEnv: {},
  withoutSrtEnv: false,
  ...overrides,
});

verifies("sandbox-srt.windows-command-line", () => {
  describe("windowsCommandLine", () => {
    it.each([
      ["no variables at all", {}],
      ["a variable to set", { programEnv: { NAME: "a value" } }],
      ["the proxy variables to remove", { withoutSrtEnv: true }],
    ])("never starts with a double quote, with %s", (_name, overrides) => {
      expect(windowsCommandLine(request(overrides)).startsWith('"')).toBe(false);
    });

    it("still ends with the quoted program and its arguments when there are no variables", () => {
      expect(
        windowsCommandLine(request()).endsWith(
          '"tools\\Program Files\\nodejs\\node.exe" "tools\\work\\a b.cjs"',
        ),
      ).toBe(true);
    });
  });
});
