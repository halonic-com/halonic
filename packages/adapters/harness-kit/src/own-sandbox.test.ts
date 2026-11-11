import type { ProgramProbe, ProgramProbeResult } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { bwrapCheckArgs, ownSandboxCheck } from "./own-sandbox.ts";

const worked: ProgramProbeResult = {
  status: "ran",
  path: "/usr/bin/x",
  code: 0,
  stdout: "",
  stderr: "",
};
const refused: ProgramProbeResult = { ...worked, code: 1 };

/** A probe that answers each program from a table, `missing` for the rest, and remembers what it was asked. */
function probeOf(answers: Readonly<Record<string, ProgramProbeResult>>) {
  const asked: string[] = [];
  const probe: ProgramProbe = {
    ask: async (program, args) => {
      asked.push([program, ...args].join(" "));
      return answers[program] ?? { status: "missing" };
    },
  };
  return { probe, asked };
}

verifies("harness-kit.own-sandbox", () => {
  describe("ownSandboxCheck", () => {
    it("is yes on macOS and asks nothing", async () => {
      const { probe, asked } = probeOf({});
      expect(await ownSandboxCheck({ probe, platform: "darwin" })()).toBe(true);
      expect(asked).toEqual([]);
    });

    it("is no on Windows and asks nothing", async () => {
      const { probe, asked } = probeOf({ bwrap: worked });
      expect(await ownSandboxCheck({ probe, platform: "win32" })()).toBe(false);
      expect(asked).toEqual([]);
    });

    it("is yes on Linux when bwrap starts a program, and asks every needed program", async () => {
      const { probe, asked } = probeOf({ bwrap: worked, socat: worked });
      const check = ownSandboxCheck({ probe, platform: "linux", linuxNeeds: ["socat"] });
      expect(await check()).toBe(true);
      expect(asked).toEqual([["bwrap", ...bwrapCheckArgs].join(" "), "socat -V"]);
    });

    it("is no on Linux when bwrap is missing or refuses, or a needed program is missing", async () => {
      const cases = [{}, { bwrap: refused }, { bwrap: worked }];
      for (const answers of cases) {
        const { probe } = probeOf(answers);
        expect(await ownSandboxCheck({ probe, platform: "linux", linuxNeeds: ["socat"] })()).toBe(
          false,
        );
      }
    });

    it("asks again for each run", async () => {
      const answers: Record<string, ProgramProbeResult> = {};
      const { probe } = probeOf(answers);
      const check = ownSandboxCheck({ probe, platform: "linux" });
      expect(await check()).toBe(false);
      answers["bwrap"] = worked;
      expect(await check()).toBe(true);
    });
  });
});
