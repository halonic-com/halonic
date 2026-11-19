import { type FileHandle, mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FileSecretStore } from "./file-secret-store.ts";

let folder: string;
let file: string;
/** The prototype every open file's handle shares, so a spy on it sees every flush. */
let handles: FileHandle;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-secrets-flush-"));
  file = join(folder, "secrets", "secrets.json");
  const probe = await open(join(folder, "probe"), "w");
  await probe.close();
  handles = Object.getPrototypeOf(probe) as FileHandle;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(folder, { recursive: true, force: true });
});

verifies("secrets-file.folder-flush", () => {
  it.skipIf(process.platform === "win32")(
    "flushes the folder once the new file is in place, before the save answers",
    async () => {
      const seenAtFolderFlush: string[] = [];
      const original = handles.sync;
      vi.spyOn(handles, "sync").mockImplementation(async function (this: FileHandle) {
        if ((await this.stat()).isDirectory()) {
          seenAtFolderFlush.push(await readFile(file, "utf8"));
        }
        await original.call(this);
      });

      await new FileSecretStore(file).setIfMissing("token-key", "made-value");

      expect(seenAtFolderFlush).toHaveLength(1);
      expect(seenAtFolderFlush[0]).toContain("made-value");
    },
  );
});
