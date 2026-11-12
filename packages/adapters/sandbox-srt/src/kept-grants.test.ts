import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { KeptGrants, type RunSrtWin, type SrtWinResult, testedSrtVersions } from "./kept-grants.ts";
import { installedSrtVersion } from "./srt-runner.ts";

// Windows paths on a made-up drive, as srt-win lists them; the sweep reads them as Windows does on any system.
const runsFolder = "Z:\\runs"; // leak-guard: allow absolute-path made-up Windows path for a test
const inRuns = "Z:\\Runs\\run_1\\files"; // leak-guard: allow absolute-path made-up Windows path for a test
const inRunsLower = "z:\\runs\\run_2"; // leak-guard: allow absolute-path made-up Windows path for a test
const outside = "Z:\\Other\\project"; // leak-guard: allow absolute-path made-up Windows path for a test
const sibling = "Z:\\RunsX"; // leak-guard: allow absolute-path made-up Windows path for a test
const workspace = "Z:\\Other"; // leak-guard: allow absolute-path made-up Windows path for a test

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
    it("forgets each folder once, naming only the folder", async () => {
      const { calls, grants } = fakeSrtWin();
      const result = await grants.forget(["work", "temp", "work"]);
      expect(result).toEqual({ heldByOthers: [], failed: [] });
      expect(calls).toEqual([
        ["acl", "forget", "work"],
        ["acl", "forget", "temp"],
      ]);
    });

    it("keeps a folder another live session of this host holds, and forgets it when that one lets go", async () => {
      const { calls, grants } = fakeSrtWin();
      grants.hold([inRuns, "temp-a"]);
      grants.hold([inRuns.toLowerCase(), "temp-b"]);
      const first = await grants.forget([inRuns, "temp-a"]);
      expect(first).toEqual({ heldByOthers: [inRuns], failed: [] });
      expect(calls).toEqual([["acl", "forget", "temp-a"]]);
      await grants.forget([inRuns, "temp-b"]);
      expect(calls.map((call) => call[2])).toEqual(["temp-a", inRuns, "temp-b"]);
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

    it("sweeps only the kept grants inside the run folder, whatever their letter case, and none a live session holds", async () => {
      const roots = [inRuns, inRunsLower, outside, sibling];
      const { calls, grants } = fakeSrtWin((args) =>
        args[0] === "user"
          ? { stdout: JSON.stringify({ persistent_grants: { state: "present", roots } }) }
          : {},
      );
      grants.hold([inRunsLower]);
      const result = await grants.sweep([runsFolder]);
      expect(result).toEqual({ heldByOthers: [inRunsLower], failed: [] });
      const forgotten = calls.filter((call) => call[0] === "acl").map((call) => call[2]);
      expect(forgotten).toEqual([inRuns]);
      // The sweep doesn't take the session's hold: its own close still finds it held once.
      await grants.forget([inRunsLower]);
      expect(calls.at(-1)).toEqual(["acl", "forget", inRunsLower]);
      expect(calls[0]).toEqual(["user", "status"]);
    });

    it("lists the grants once for several roots, and forgets those inside any of them", async () => {
      const roots = [inRuns, outside, sibling];
      const { calls, grants } = fakeSrtWin((args) =>
        args[0] === "user" ? { stdout: JSON.stringify({ persistent_grants: { roots } }) } : {},
      );
      const result = await grants.sweep([runsFolder, workspace]);
      expect(result).toEqual({ heldByOthers: [], failed: [] });
      expect(calls).toEqual([
        ["user", "status"],
        ["acl", "forget", inRuns],
        ["acl", "forget", outside],
      ]);
    });

    it("starts nothing without a root", async () => {
      const { calls, grants } = fakeSrtWin();
      expect(await grants.sweep([])).toEqual({ heldByOthers: [], failed: [] });
      expect(calls).toEqual([]);
    });

    it("reports a sweep that can't list the grants", async () => {
      const { calls, grants } = fakeSrtWin(() => ({ status: 1, stderr: "no install" }));
      const result = await grants.sweep([runsFolder]);
      expect(result.failed[0]?.reason).toMatch(/can't be listed: exit 1: no install/);
      expect(calls).toHaveLength(1);
    });

    it("reports a sweep that can't read the list", async () => {
      const { grants } = fakeSrtWin(() => ({ stdout: "not json" }));
      expect((await grants.sweep([runsFolder])).failed).toHaveLength(1);
    });

    // A sandbox-runtime bump fails here, on every system, not only on Windows or a user's machine.
    it("is tested with the installed sandbox-runtime", () => {
      expect(testedSrtVersions).toContain(installedSrtVersion());
    });
  });
});
