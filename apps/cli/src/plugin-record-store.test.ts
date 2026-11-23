import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginSettingsCollection } from "@halonicjs/app";
import { BrokenRecordLogError, type RecordStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  DamagedPluginRecordError,
  PluginRecordStore,
  UnreadablePluginRecordError,
} from "./plugin-record-store.ts";
import { removeTestFolder } from "./test/remove-folder.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-records-"));
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** A file system error as Node gives it, with its code and the path it refused. */
function fileSystemError(code: string, path?: string): Error {
  return Object.assign(new Error(`${code}: permission denied, open`), { code, path });
}

/** A record store whose every call fails with `error`. */
function failingStore(error: unknown): RecordStore {
  const fail = async (): Promise<never> => {
    throw error;
  };
  return { append: fail, changes: fail, compact: fail };
}

const onWindows = process.platform === "win32";

verifies("cli.plugin-record-unreadable", () => {
  it("names a record file the person may not open, with chmod 600", async () => {
    const file = join(folder, "settings.jsonl");
    const denied = fileSystemError("EACCES", file);
    const records = new PluginRecordStore(failingStore(denied), folder);

    const failure = await records
      .changes(pluginSettingsCollection)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnreadablePluginRecordError);
    expect(failure).toMatchObject({
      kind: "denied",
      code: "plugin-record-unreadable",
      path: file,
      message: `The plugin record file ${file} can't be read by your user account.`,
      fix: onWindows
        ? "Give your user account access to it in the file's Properties, under Security, then run again."
        : `Run chmod 600 ${file}, then run again.`,
      cause: denied,
    });
  });

  it("refuses an append or a compact the same way, and EPERM as EACCES", async () => {
    const file = join(folder, "settings.jsonl");
    const records = new PluginRecordStore(failingStore(fileSystemError("EPERM", file)), folder);

    await expect(records.append([])).rejects.toBeInstanceOf(UnreadablePluginRecordError);
    await expect(records.compact(pluginSettingsCollection)).rejects.toBeInstanceOf(
      UnreadablePluginRecordError,
    );
  });

  it("names the folder, with chmod 700, when the refusal names no file", async () => {
    const records = new PluginRecordStore(failingStore(fileSystemError("EACCES")), folder);

    await expect(records.changes(pluginSettingsCollection)).rejects.toMatchObject({
      path: folder,
      message: `The plugin records folder ${folder} can't be read by your user account.`,
      ...(onWindows ? {} : { fix: `Run chmod 700 ${folder}, then run again.` }),
    });
  });

  it("names a damaged file and its line, and says deleting it resets the settings", async () => {
    const broken = new BrokenRecordLogError("/srv/acme/settings.jsonl", "it is not JSON.", 3);
    const records = new PluginRecordStore(failingStore(broken), folder);

    const failure = await records
      .changes(pluginSettingsCollection)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DamagedPluginRecordError);
    expect(failure).toMatchObject({
      kind: "unavailable",
      code: "plugin-record-damaged",
      path: "/srv/acme/settings.jsonl",
      message:
        "The plugin record file /srv/acme/settings.jsonl is damaged at line 3: it is not JSON.",
      fix: "Delete line 3 from it, or delete the file, then run again. Deleting the file sets every plugin's settings back to their defaults; the plugins stay.",
      cause: broken,
    });
  });

  it("asks only to delete a file that is damaged as a whole", async () => {
    const broken = new BrokenRecordLogError("/srv/acme/other.jsonl", "it is not valid UTF-8 text.");
    const records = new PluginRecordStore(failingStore(broken), folder);

    await expect(records.changes("other")).rejects.toMatchObject({
      message:
        "The plugin record file /srv/acme/other.jsonl is damaged: it is not valid UTF-8 text.",
      fix: "Delete the file, then run again.",
    });
  });

  it("keeps any other error as it is", async () => {
    const busy = fileSystemError("EIO", join(folder, "settings.jsonl"));
    const records = new PluginRecordStore(failingStore(busy), folder);

    await expect(records.changes(pluginSettingsCollection)).rejects.toBe(busy);
  });
});
