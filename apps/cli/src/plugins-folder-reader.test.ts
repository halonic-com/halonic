import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FolderReader } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PluginsFolderReader, UnreadablePluginsFolderError } from "./plugins-folder-reader.ts";
import { removeTestFolder } from "./test/remove-folder.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugins-folder-"));
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** A file system error with the code Node gives it, such as `EACCES`. */
function fileSystemError(code: string): Error {
  return Object.assign(new Error(`${code}: permission denied, scandir`), { code });
}

/** A folder reader whose listing of `failingDir` (the folder itself when left out) fails with `error`. */
function failingReader(error: Error, failingDir?: string): FolderReader {
  return {
    location: folder,
    entries: async (dir) => {
      if (dir === failingDir) throw error;
      return [];
    },
    read: async () => null,
    locationOf: async () => folder,
  };
}

verifies("cli.plugins-folder-unreadable", () => {
  it("refuses a plugins folder the person may not list, naming it with its fix", async () => {
    const denied = fileSystemError("EACCES");
    const reader = new PluginsFolderReader(failingReader(denied), folder);

    const failure = await reader.entries().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnreadablePluginsFolderError);
    const yours = process.platform !== "win32";
    expect(failure).toMatchObject({
      kind: "denied",
      code: "plugins-folder-unreadable",
      folder,
      access: yours ? "yours" : "windows",
      message: `The plugins folder ${folder} can't be read by your user account.`,
      cause: denied,
    });
    if (yours) {
      expect(failure).toMatchObject({ fix: `Run chmod 700 ${folder}, then run again.` });
    } else {
      expect(failure).toMatchObject({
        fix: "Give your user account access to it in the folder's Properties, under Security, then run again.",
      });
    }
  });

  it("refuses EPERM the same way, which Windows and some file systems give", async () => {
    const reader = new PluginsFolderReader(failingReader(fileSystemError("EPERM")), folder);

    await expect(reader.entries()).rejects.toBeInstanceOf(UnreadablePluginsFolderError);
  });

  it("keeps the error of a plugin's own folder, so only that plugin is broken", async () => {
    const denied = fileSystemError("EACCES");
    const reader = new PluginsFolderReader(failingReader(denied, "weather"), folder);

    await expect(reader.entries("weather")).rejects.toBe(denied);
  });

  it("gives sudo chown, then chmod 700, for a folder another user owns", () => {
    const failure = new UnreadablePluginsFolderError(
      "/srv/acme/plugin folders",
      "another-user",
      fileSystemError("EACCES"),
    );

    expect(failure.fix).toBe(
      'It belongs to another user: run sudo chown "$(id -un)" "/srv/acme/plugin folders", then chmod 700 "/srv/acme/plugin folders", then run again.',
    );
  });

  it("keeps any other error of the folder itself", async () => {
    const busy = fileSystemError("EIO");
    const reader = new PluginsFolderReader(failingReader(busy), folder);

    await expect(reader.entries()).rejects.toBe(busy);
  });
});
