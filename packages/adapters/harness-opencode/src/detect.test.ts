import type { ProgramProbe, ProgramProbeResult } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { detectOpenCode } from "./detect.ts";

/** `opencode --version` ending with `code`, having printed `stdout`. */
function ran(code: number | null, stdout: string): ProgramProbeResult {
  return { status: "ran", path: "/usr/local/bin/opencode", code, stdout, stderr: "" };
}

/** Detects OpenCode with this answer to `opencode --version`, and checks nothing else was asked. */
async function detectWith(answer: ProgramProbeResult) {
  const asked: string[] = [];
  const probe: ProgramProbe = {
    ask: async (program, args) => {
      asked.push([program, ...args].join(" "));
      return answer;
    },
  };
  const found = await detectOpenCode(probe);
  expect(asked).toEqual(["opencode --version"]);
  return found;
}

verifies("harness-opencode.detect", () => {
  describe("detectOpenCode", () => {
    it("is ready with the tested version, as 2.3.0 prints it", async () => {
      expect(await detectWith(ran(0, "opencode v2.3.0\n"))).toEqual({
        status: "ready",
        version: "2.3.0",
      });
      expect(await detectWith(ran(0, "opencode v2.3.0\r\n"))).toEqual({
        status: "ready",
        version: "2.3.0",
      });
    });

    it("refuses every other version, newer ones too, naming the one to install", async () => {
      for (const version of ["2.3.1", "2.2.9", "2.4.0", "2.3.0-beta.1"]) {
        expect(await detectWith(ran(0, `opencode v${version}`))).toEqual({
          status: "unsupported",
          version,
          supported: "2.3.0",
        });
      }
    });

    it("is missing when the program isn't found", async () => {
      expect(await detectWith({ status: "missing" })).toEqual({ status: "missing" });
    });

    it("fails without the program's output when the version can't be read", async () => {
      const cases: Array<[ProgramProbeResult, string]> = [
        [ran(0, "2.3.0"), "`opencode --version` didn't print a version."],
        [ran(0, "opencode 2.3.0"), "`opencode --version` didn't print a version."],
        [ran(0, "opencode vnext"), "`opencode --version` didn't print a version."],
        [ran(2, "opencode v2.3.0"), "`opencode --version` ended with code 2."],
        [ran(null, ""), "`opencode --version` was stopped before it answered."],
        [
          { status: "failed", path: "/usr/local/bin/opencode", error: "Couldn't start opencode." },
          "Couldn't start opencode.",
        ],
      ];
      for (const [answer, error] of cases) {
        expect(await detectWith(answer)).toEqual({ status: "failed", error });
      }
    });
  });
});
