import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { KeptGrants, type RunSrtWin } from "./kept-grants.ts";

const folderA = "Z:\\Runs\\a"; // leak-guard: allow absolute-path made-up Windows path for a test
const sweepRoot = "Z:\\Runs"; // leak-guard: allow absolute-path made-up Windows path for a test
const folderB = "Z:\\Runs\\b"; // leak-guard: allow absolute-path made-up Windows path for a test

const temps: string[] = [];
afterEach(() => {
  for (const folder of temps.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const kept = (...folders: string[]) => JSON.stringify({ persistent_grants: { roots: folders } });

function setup(status = 0, listed: string[] = []) {
  const folder = mkdtempSync(join(tmpdir(), "kept-record-"));
  temps.push(folder);
  const recordFolder = join(folder, "nested", "kept-grants");
  const calls: string[][] = [];
  const run: RunSrtWin = async (args) => {
    calls.push(args);
    return { status, stdout: args[0] === "user" ? kept(...listed) : "", stderr: "" };
  };
  return {
    recordFolder,
    calls,
    grants: new KeptGrants(run, () => "0.0.82", recordFolder),
    another: () => new KeptGrants(run, () => "0.0.82", recordFolder),
  };
}

const files = (folder: string): string[] => (existsSync(folder) ? readdirSync(folder) : []);
const recordedFolders = (folder: string): string[] =>
  files(folder).flatMap((name) => JSON.parse(readFileSync(join(folder, name), "utf8")));
/** A record file of a process that is gone (no process has this id). */
const deadRecord = (folder: string, content: string, name = "2147483646-x.json") => {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, name), content);
};

verifies("sandbox-srt.kept-grants", () => {
  describe("KeptGrants write-ahead record", () => {
    it("writes the folders before anything runs, and a forget takes them out", async () => {
      const { recordFolder, calls, grants } = setup();
      grants.record([folderA, folderB]);
      expect(calls).toEqual([]);
      expect(recordedFolders(recordFolder)).toEqual([folderA, folderB]);
      await grants.forget([folderA]);
      expect(recordedFolders(recordFolder)).toEqual([folderB]);
      await grants.forget([folderB]);
      expect(files(recordFolder)).toEqual([]);
    });

    it("keeps a folder in the record when its forget fails", async () => {
      const { recordFolder, grants } = setup(1);
      grants.record([folderA]);
      const result = await grants.forget([folderA]);
      expect(result.failed).toHaveLength(1);
      expect(recordedFolders(recordFolder)).toEqual([folderA]);
    });

    it("keeps each host process's record in its own file", () => {
      const { recordFolder, grants, another } = setup();
      grants.record([folderA]);
      another().record([folderB]);
      expect(files(recordFolder)).toHaveLength(2);
      expect(recordedFolders(recordFolder).sort()).toEqual([folderA, folderB]);
    });

    it("sweeps the record of a gone process: forgets a listed folder outside the roots", async () => {
      const { recordFolder, calls, grants } = setup(0, [folderA]);
      deadRecord(recordFolder, JSON.stringify([folderA]));
      const result = await grants.sweep([sweepRoot]);
      expect(result).toEqual({ heldByOthers: [], failed: [] });
      expect(calls).toContainEqual(["acl", "forget", folderA]);
      expect(files(recordFolder)).toEqual([]);
    });

    it("only drops a recorded folder srt doesn't list, as no grant was made on it", async () => {
      const { recordFolder, calls, grants } = setup();
      deadRecord(recordFolder, JSON.stringify([folderA]));
      expect(await grants.sweep([sweepRoot])).toEqual({ heldByOthers: [], failed: [] });
      expect(calls.filter((call) => call[1] === "forget")).toEqual([]);
      expect(files(recordFolder)).toEqual([]);
    });

    it("keeps a gone process's folder in its file when the forget fails", async () => {
      const { recordFolder, grants } = setup(1, [folderA]);
      deadRecord(recordFolder, JSON.stringify([folderA]));
      expect((await grants.sweep([sweepRoot])).failed).toHaveLength(1);
      expect(recordedFolders(recordFolder)).toEqual([folderA]);
    });

    it("never touches the record of a process that still runs", async () => {
      const outside = "Z:\\Other\\c"; // leak-guard: allow absolute-path made-up Windows path for a test
      const { recordFolder, calls, grants, another } = setup(0, [outside]);
      another().record([outside]);
      expect(await grants.sweep([sweepRoot])).toEqual({ heldByOthers: [], failed: [] });
      expect(calls.filter((call) => call[1] === "forget")).toEqual([]);
      expect(recordedFolders(recordFolder)).toEqual([outside]);
    });

    it("does not sweep a recorded folder a live session holds, even before srt lists it", async () => {
      const { recordFolder, calls, grants } = setup();
      grants.record([folderA]);
      grants.hold([folderA]);
      const result = await grants.sweep([sweepRoot]);
      expect(result.heldByOthers).toEqual([folderA]);
      expect(calls.filter((call) => call[1] === "forget")).toEqual([]);
      expect(recordedFolders(recordFolder)).toEqual([folderA]);
    });

    it("reports a record file it can't read and leaves it", async () => {
      const { recordFolder, grants } = setup();
      deadRecord(recordFolder, "not json");
      const result = await grants.sweep([sweepRoot]);
      expect(result.failed).toHaveLength(1);
      expect(files(recordFolder)).toHaveLength(1);
    });

    it("leaves the record alone without a sweep root, as the host without the profile lock has none", async () => {
      const { recordFolder, calls, grants } = setup();
      deadRecord(recordFolder, JSON.stringify([folderA]));
      expect(await grants.sweep([])).toEqual({ heldByOthers: [], failed: [] });
      expect(calls).toEqual([]);
      expect(recordedFolders(recordFolder)).toEqual([folderA]);
    });

    it("fails with a sentence naming the record when it can't be written", () => {
      const { recordFolder, grants } = setup();
      mkdirSync(join(recordFolder, ".."), { recursive: true });
      writeFileSync(recordFolder, "a file where the folder should be");
      expect(() => grants.record([folderA])).toThrow(/can't write the kept-grant record at/);
    });

    it("writes nothing without a record folder", () => {
      expect(() => new KeptGrants().record([folderA])).not.toThrow();
    });
  });
});
