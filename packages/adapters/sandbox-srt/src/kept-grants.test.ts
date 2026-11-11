import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { KeptGrants, type RunSrtWin, type SrtWinResult } from "./kept-grants.ts";

// Windows paths on a made-up drive, as srt-win lists them; the sweep reads them as Windows does on any system.
const runsFolder = "Z:\\runs"; // leak-guard: allow absolute-path made-up Windows path for a test
const inRuns = "Z:\\Runs\\run_1\\files"; // leak-guard: allow absolute-path made-up Windows path for a test
const inRunsLower = "z:\\runs\\run_2"; // leak-guard: allow absolute-path made-up Windows path for a test
const outside = "Z:\\Other\\project"; // leak-guard: allow absolute-path made-up Windows path for a test
const sibling = "Z:\\RunsX"; // leak-guard: allow absolute-path made-up Windows path for a test

/** A fake `srt-win` that records its calls and answers from `answer`. */
function fakeSrtWin(answer: (args: string[]) => Partial<SrtWinResult> = () => ({})) {
  const calls: string[][] = [];
  const run: RunSrtWin = async (args) => {
    calls.push(args);
    return { status: 0, stdout: "", stderr: "", ...answer(args) };
  };
  return { calls, grants: new KeptGrants(run, () => "0.0.81") };
}

verifies("sandbox-srt.kept-grants", () => {
  describe("KeptGrants", () => {
    it("forgets each folder once, unless another session holds it", async () => {
      const { calls, grants } = fakeSrtWin();
      const result = await grants.forget(["work", "temp", "work"]);
      expect(result).toEqual({ heldByOthers: [], failed: [] });
      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call.slice(0, 2)).toEqual(["acl", "forget"]);
        expect(call.at(-1)).toBe("--unless-held-by-others");
      }
    });

    it("does not count a grant another live session holds as a failure", async () => {
      const { grants } = fakeSrtWin(() => ({ status: 22 }));
      const result = await grants.forget(["work"]);
      expect(result.failed).toEqual([]);
      expect(result.heldByOthers).toHaveLength(1);
    });

    it("reports a failing folder with its reason, and goes on with the rest", async () => {
      const { calls, grants } = fakeSrtWin((args) =>
        args.includes("work") ? { status: 1, stderr: "access\r\ndenied" } : {},
      );
      const result = await grants.forget(["work", "temp"]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.reason).toBe("exit 1: access denied");
      expect(calls).toHaveLength(2);
    });

    it("reports a srt-win that can't be started", async () => {
      const grants = new KeptGrants(
        async () => {
          throw new Error("srt-win.exe not found");
        },
        () => "0.0.81",
      );
      const result = await grants.forget(["work"]);
      expect(result.failed[0]?.reason).toBe("srt-win.exe not found");
    });

    it("refuses a version of sandbox-runtime it was not tried with", () => {
      const grants = new KeptGrants(undefined, () => "0.0.99");
      expect(() => grants.assertSupported()).toThrow(/0\.0\.99 is not tested/);
    });

    it("refuses when the version can't be read", () => {
      const grants = new KeptGrants(undefined, () => {
        throw new Error("no package.json");
      });
      expect(() => grants.assertSupported()).toThrow(/no package\.json/);
    });

    it("accepts the tested version", () => {
      expect(() => fakeSrtWin().grants.assertSupported()).not.toThrow();
    });

    it("sweeps only the kept grants inside the run folder, whatever their letter case", async () => {
      const roots = [inRuns, inRunsLower, outside, sibling];
      const { calls, grants } = fakeSrtWin((args) =>
        args[0] === "user"
          ? { stdout: JSON.stringify({ persistent_grants: { state: "present", roots } }) }
          : {},
      );
      const result = await grants.sweep(runsFolder);
      expect(result.failed).toEqual([]);
      const forgotten = calls.filter((call) => call[0] === "acl").map((call) => call[2]);
      expect(forgotten).toEqual([inRuns, inRunsLower]);
      expect(calls[0]).toEqual(["user", "status"]);
    });

    it("reports a sweep that can't list the grants", async () => {
      const { calls, grants } = fakeSrtWin(() => ({ status: 1, stderr: "no install" }));
      const result = await grants.sweep(runsFolder);
      expect(result.failed[0]?.reason).toMatch(/can't be listed: exit 1: no install/);
      expect(calls).toHaveLength(1);
    });

    it("reports a sweep that can't read the list", async () => {
      const { grants } = fakeSrtWin(() => ({ stdout: "not json" }));
      expect((await grants.sweep(runsFolder)).failed).toHaveLength(1);
    });
  });
});
