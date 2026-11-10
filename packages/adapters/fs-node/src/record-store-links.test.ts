import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { link, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RecordChange } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { FileRecordStore } from "./record-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const note: RecordChange = {
  at: "2026-01-01T00:00:00.000Z",
  collection: "clerk-notes",
  id: "1",
  op: "add",
  values: { text: "Call Acme on Monday" },
};
const outsideText = `${JSON.stringify(note)}\n`;

/** A store whose log for `clerk-notes` is made by `place`, and a valid log outside its folder. */
async function storeWithLog(
  place: (outside: string, log: string) => Promise<void>,
): Promise<{ store: FileRecordStore; outside: string }> {
  const root = join(await tempFolder(), "records");
  await mkdir(root, { recursive: true });
  // Such as a file in a workspace, which an agent may edit.
  const outside = join(await tempFolder(), "notes.jsonl");
  await writeFile(outside, outsideText, "utf8");
  const log = join(
    root,
    `${createHash("sha256").update("clerk-notes", "utf16le").digest("hex")}.jsonl`,
  );
  await place(outside, log);
  return { store: new FileRecordStore(root), outside };
}

/** Reading, appending and compacting all throw `message`, and the file outside stays as it was. */
async function expectRefused(
  store: FileRecordStore,
  outside: string,
  message: string,
): Promise<void> {
  await expect(store.changes("clerk-notes")).rejects.toThrow(message);
  await expect(store.append([{ ...note, id: "2" }])).rejects.toThrow(message);
  await expect(store.compact("clerk-notes")).rejects.toThrow(message);
  expect(await readFile(outside, "utf8")).toBe(outsideText);
}

// A link could put an agent's notes in a file the agent may edit, or let an
// append write into one (HAL-2978, HAL-3009).
verifies("fs-node.record-store-files", () => {
  describe("a log that is a link", () => {
    it("refuses a symbolic link to a valid log outside the folder", async () => {
      const { store, outside } = await storeWithLog((target, log) => symlink(target, log));
      await expectRefused(store, outside, "is a link");
    });

    it("refuses a symbolic link to nothing rather than reading it as empty", async () => {
      const gone = join(await tempFolder(), "gone.jsonl");
      const { store, outside } = await storeWithLog((_target, log) => symlink(gone, log));
      await expectRefused(store, outside, "is a link");
    });

    // Any program can make a junction on Windows, without special rights.
    it("refuses a junction in the log's place", async () => {
      const folder = await tempFolder();
      const { store, outside } = await storeWithLog((_target, log) =>
        symlink(folder, log, "junction"),
      );
      await expectRefused(store, outside, "is a link");
    });

    it("refuses a hard link to a valid log outside the folder", async () => {
      const { store, outside } = await storeWithLog((target, log) => link(target, log));
      await expectRefused(store, outside, "is a hard link");
    });

    // Opening a named pipe waits for a writer, so reading one would hang (HAL-2985).
    it.skipIf(process.platform === "win32")(
      "[platform:win32] needs POSIX links, modes and signals: refuses a named pipe rather than waiting on it",
      async () => {
        const { store, outside } = await storeWithLog(async (_target, log) => {
          await promisify(execFile)("mkfifo", [log]);
        });
        await expectRefused(store, outside, "isn't a plain file");
      },
    );
  });
});
