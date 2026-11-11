import { chmod, link, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { createExclusive } from "./run-lock.ts";
import { FolderRunStore } from "./run-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

/** Windows has no file modes: Node reports `666` there for any folder or file that isn't read-only. */
const privateFolderMode = process.platform === "win32" ? 0o666 : 0o700;
const privateFileMode = process.platform === "win32" ? 0o666 : 0o600;

function started(runId: string): RunEvent {
  return {
    runId,
    seq: 1,
    at: "2026-01-01T00:00:01.000Z",
    type: "run.started",
    hubId: "hub",
    workflowId: "flow",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
}

function entered(runId: string, seq: number): RunEvent {
  return { runId, seq, at: "2026-01-01T00:00:02.000Z", type: "state.entered", state: `s${seq}` };
}

/** The file's permission bits. */
async function modeOf(file: string): Promise<number> {
  return (await stat(file)).mode & 0o777;
}

/** A store whose `r1.jsonl` is made by `place`, and a valid log of `r1` outside its folder. */
async function storeWithLog(
  place: (outside: string, log: string) => Promise<void>,
): Promise<{ store: FolderRunStore; outside: string; text: string }> {
  const root = join(await tempFolder(), "runs");
  await mkdir(root, { recursive: true });
  // Such as a file in a workspace, which an agent may edit.
  const outside = join(await tempFolder(), "r1.jsonl");
  const text = `${JSON.stringify(started("r1"))}\n`;
  await writeFile(outside, text, "utf8");
  await place(outside, join(root, "r1.jsonl"));
  return { store: new FolderRunStore(root), outside, text };
}

// Run logs hold prompts, tool results and model output, so another account
// on the computer mustn't read them, and a link mustn't put a run's log in a
// file an agent may edit (HAL-5215).
verifies("fs-node.run-store-private-files", () => {
  describe("private files", () => {
    it("creates the folder with mode 700 and the log and snapshot with mode 600", async () => {
      const root = join(await tempFolder(), "workspace", "runs");
      const store = new FolderRunStore(root);

      await store.append("r1", 0, [started("r1")], { snapshot: { step: 1 } });

      expect(await modeOf(root)).toBe(privateFolderMode);
      expect(await modeOf(join(root, "r1.jsonl"))).toBe(privateFileMode);
      expect(await modeOf(join(root, "r1.snapshot.json"))).toBe(privateFileMode);
    });

    it("makes a folder made earlier with default permissions private", async () => {
      const root = join(await tempFolder(), "runs");
      await mkdir(root);
      await chmod(root, 0o755);

      await new FolderRunStore(root).append("r1", 0, [started("r1")]);

      expect(await modeOf(root)).toBe(privateFolderMode);
    });

    it("creates the run's lock with mode 600", async () => {
      const file = join(await tempFolder(), "r1.lock");

      expect(await createExclusive(file, "{}")).toBe(true);

      expect(await modeOf(file)).toBe(privateFileMode);
    });
  });

  describe("a log that is a link", () => {
    it("refuses a symbolic link on read and append, and leaves the file it points to alone", async () => {
      const { store, outside, text } = await storeWithLog((target, log) => symlink(target, log));

      await expect(store.events("r1")).rejects.toThrow("is a link");
      await expect(store.append("r1", 1, [entered("r1", 2)])).rejects.toThrow("is a link");
      expect(await readFile(outside, "utf8")).toBe(text);
    });

    it("refuses a hard link on read and append, and leaves the file alone", async () => {
      const { store, outside, text } = await storeWithLog((target, log) => link(target, log));

      await expect(store.events("r1")).rejects.toThrow("is a hard link");
      await expect(store.append("r1", 1, [entered("r1", 2)])).rejects.toThrow("is a hard link");
      expect(await readFile(outside, "utf8")).toBe(text);
    });

    it("doesn't read a snapshot that is a link", async () => {
      const root = join(await tempFolder(), "runs");
      const store = new FolderRunStore(root);
      await store.append("r1", 0, [started("r1")]);
      const outside = join(await tempFolder(), "snapshot.json");
      await writeFile(outside, JSON.stringify({ seq: 1, state: { from: "outside" } }), "utf8");
      await symlink(outside, join(root, "r1.snapshot.json"));

      expect(await store.snapshot("r1")).toBeNull();
    });
  });
});
