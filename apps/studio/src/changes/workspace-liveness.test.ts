import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { VcsChange } from "@halonicjs/ports";
import type { ChangesRead, Version } from "@halonicjs/studio-feature-source-control/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { WatchedChanges } from "./watched-changes.ts";
import type { GitAnswer } from "./workspace-changes.ts";
import { WorkspaceLiveness } from "./workspace-liveness.ts";
import { choicesMemory } from "./workspace-merge.ts";

const path = "hubs/acme/workflows/routines/weekly-report.routine.yaml";
const weekly = (schedule: string) =>
  [
    "name: Weekly report",
    "trigger:",
    `  schedule: "${schedule}"`,
    "run:",
    "  agent: analyst",
    "  prompt: Write the report.",
    "",
  ].join("\n");
const mondays = weekly("0 9 * * 1");
const tuesdays = weekly("0 9 * * 2");
const lastVersion: Version = {
  id: "a".repeat(40),
  name: "Weekly report",
  notes: "",
  author: "Acme",
  at: Date.parse("2026-11-18T10:42:00Z"),
  files: [path],
};

/**
 * The liveness of a folder whose history reads as `read` says, with `lastVersion` as its last
 * version when it has one; `before` is a changed file as that version has it.
 */
function liveness(
  read: ChangesRead,
  saved: Record<string, string>,
  { versions = [lastVersion], before = null as string | null } = {},
) {
  const asked: VcsChange[] = [];
  const subject = new WorkspaceLiveness({
    history: {
      read: async () => read,
      readHistory: async () => versions,
      readTexts: async (change) => {
        asked.push(change);
        return { before, after: saved[change.path] ?? null };
      },
    },
    saved: new MemoryDefinitionStore(saved),
  });
  return { subject, asked };
}

const ready = (...changes: VcsChange[]): ChangesRead => ({ kind: "ready", changes });

verifies("studio.workspace-liveness", () => {
  describe("WorkspaceLiveness.liveState", () => {
    it("is live in a folder that keeps no history, or where git isn't there", async () => {
      for (const read of [{ kind: "not-a-repository" }, { kind: "no-git" }] as const) {
        const { subject } = liveness(read, { [path]: mondays });
        expect(await subject.liveState(path)).toEqual({ state: "live" });
      }
    });

    it("is never-versioned in a repository with no version yet", async () => {
      const { subject } = liveness(ready(), { [path]: mondays }, { versions: [] });
      expect(await subject.liveState(path)).toEqual({ state: "never-versioned" });
    });

    it("is live for a file unchanged since the last version, without reading its diff", async () => {
      const { subject, asked } = liveness(ready(), { [path]: mondays });
      expect(await subject.liveState(path)).toEqual({ state: "live" });
      expect(asked).toEqual([]);
    });

    it("is not live since the last version for a saved change", async () => {
      const change: VcsChange = { path, status: "modified", staged: false };
      const { subject, asked } = liveness(ready(change), { [path]: tuesdays }, { before: mondays });
      expect(await subject.liveState(path)).toEqual({
        state: "not-live",
        since: "2026-11-18T10:42:00.000Z",
      });
      expect(asked).toEqual([change]);
    });

    it("is never-versioned for a file git doesn't track yet, or one renamed since", async () => {
      const untracked = liveness(ready({ path, status: "untracked", staged: false }), {
        [path]: mondays,
      });
      expect(await untracked.subject.liveState(path)).toEqual({ state: "never-versioned" });

      const renamed = { path, status: "renamed", staged: true, from: "old.routine.yaml" } as const;
      const moved = liveness(ready(renamed), { [path]: mondays }, { before: mondays });
      expect(await moved.subject.liveState(path)).toEqual({ state: "never-versioned" });
      expect(moved.asked).toEqual([]);
    });
  });

  describe("WorkspaceLiveness.routineVersions", () => {
    it("gives the routine as the last version has it", async () => {
      const change: VcsChange = { path, status: "modified", staged: false };
      const { subject } = liveness(ready(change), { [path]: tuesdays }, { before: mondays });
      const versions = await subject.routineVersions(path);
      expect(versions.liveState.state).toBe("not-live");
      expect(versions.live?.trigger).toEqual({ schedule: "0 9 * * 1" });
      expect(versions.saved?.trigger).toEqual({ schedule: "0 9 * * 2" });
    });
  });

  describe("in a real repository", () => {
    it("follows a saved change until a version holds it", async () => {
      const dir = mkdtempSync(join(tmpdir(), "liveness-"));
      try {
        const git = async (args: readonly string[]): Promise<GitAnswer> => {
          const run = spawnSync(
            "git",
            ["-c", "user.name=T", "-c", "user.email=t@example.com", ...args],
            { cwd: dir, encoding: "utf8" },
          );
          return { code: run.status, stdout: run.stdout, stderr: run.stderr };
        };
        const write = (text: string) => {
          mkdirSync(dirname(join(dir, path)), { recursive: true });
          writeFileSync(join(dir, path), text);
        };
        const files = new FolderDefinitionStore(dir);
        const changes = new WatchedChanges({
          git,
          files,
          copies: files,
          choices: choicesMemory(undefined, "test"),
          digest: { sha256: async () => new Uint8Array(32) },
          onFocus: () => () => {},
          onFilesChanged: () => () => {},
        });
        const subject = new WorkspaceLiveness({ history: changes, saved: files });
        const stateNow = async () => (await subject.liveState(path)).state;

        write(mondays);
        expect(await stateNow()).toBe("live");
        await git(["init", "--quiet"]);
        expect(await stateNow()).toBe("never-versioned");
        await changes.createVersion({ message: "Weekly report", paths: [path] });
        expect(await stateNow()).toBe("live");
        write(tuesdays);
        expect(await stateNow()).toBe("not-live");
        expect((await subject.routineVersions(path)).live?.trigger).toEqual({
          schedule: "0 9 * * 1",
        });
        await changes.createVersion({ message: "On Tuesdays", paths: [path] });
        expect(await stateNow()).toBe("live");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("WatchedChanges.onNewVersion", () => {
    it("tells a listener a version was created, and not after it stopped", async () => {
      const files = new MemoryDefinitionStore();
      const changes = new WatchedChanges({
        git: async (): Promise<GitAnswer> => ({ code: 0, stdout: "", stderr: "" }),
        files,
        copies: files,
        choices: choicesMemory(undefined, "test"),
        digest: { sha256: async () => new Uint8Array(32) },
        onFocus: () => () => {},
        onFilesChanged: () => () => {},
      });
      let heard = 0;
      const stop = changes.onNewVersion(() => {
        heard += 1;
      });
      await changes.createVersion({ message: "Weekly report", paths: [path] });
      expect(heard).toBe(1);

      stop();
      await changes.createVersion({ message: "Again", paths: [path] });
      expect(heard).toBe(1);
    });
  });
});
