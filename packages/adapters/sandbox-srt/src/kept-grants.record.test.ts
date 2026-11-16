import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { KeptGrants, type RunSrtWin } from "./kept-grants.ts";

const folderA = "Z:\\Runs\\a"; // leak-guard: allow absolute-path made-up Windows path for a test
const folderB = "Z:\\Runs\\b"; // leak-guard: allow absolute-path made-up Windows path for a test

const temps: string[] = [];
afterEach(() => {
  for (const folder of temps.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function setup(status = 0) {
  const folder = mkdtempSync(join(tmpdir(), "kept-record-"));
  temps.push(folder);
  const file = join(folder, "nested", "record.json");
  const calls: string[][] = [];
  const run: RunSrtWin = async (args) => {
    calls.push(args);
    return { status, stdout: args[0] === "user" ? "{}" : "", stderr: "" };
  };
  return { file, calls, grants: new KeptGrants(run, () => "0.0.82", file) };
}

const recordedFolders = (file: string): string[] => JSON.parse(readFileSync(file, "utf8"));

verifies("sandbox-srt.kept-grants", () => {
  describe("KeptGrants write-ahead record", () => {
    it("writes the folders before anything runs, and a forget takes them out", async () => {
      const { file, calls, grants } = setup();
      grants.record([folderA, folderB]);
      expect(calls).toEqual([]);
      expect(recordedFolders(file)).toEqual([folderA, folderB]);
      await grants.forget([folderA]);
      expect(recordedFolders(file)).toEqual([folderB]);
      await grants.forget([folderB]);
      expect(existsSync(file)).toBe(false);
    });

    it("keeps a folder in the record when its forget fails", async () => {
      const { file, grants } = setup(1);
      grants.record([folderA]);
      const result = await grants.forget([folderA]);
      expect(result.failed).toHaveLength(1);
      expect(recordedFolders(file)).toEqual([folderA]);
    });

    it("sweeps recorded folders after a crash, even with no sweep root", async () => {
      const { file, calls, grants } = setup();
      grants.record([folderA]);
      const restarted = new KeptGrants(
        async (args) => {
          calls.push(args);
          return { status: 0, stdout: "{}", stderr: "" };
        },
        () => "0.0.82",
        file,
      );
      const result = await restarted.sweep([]);
      expect(result).toEqual({ heldByOthers: [], failed: [] });
      expect(calls).toContainEqual(["acl", "forget", folderA]);
      expect(existsSync(file)).toBe(false);
    });

    it("does not sweep a recorded folder a live session holds", async () => {
      const { calls, grants } = setup();
      grants.record([folderA]);
      grants.hold([folderA]);
      const result = await grants.sweep([]);
      expect(result.heldByOthers).toEqual([folderA]);
      expect(calls.filter((call) => call[1] === "forget")).toEqual([]);
    });

    it("drops the record when everything is forgotten", async () => {
      const { file, grants } = setup();
      grants.record([folderA]);
      expect(await grants.forgetAll()).toEqual([]);
      expect(existsSync(file)).toBe(false);
    });

    it("writes nothing without a record file", () => {
      expect(() => new KeptGrants().record([folderA])).not.toThrow();
    });
  });
});
