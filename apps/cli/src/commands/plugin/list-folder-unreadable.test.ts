import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { FolderReader } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { type PluginSetup, setupPluginsFolder } from "../../plugin-host.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { pluginCommandWith } from "./command.ts";

let folder: string;
let setup: PluginSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-plugin-list-unreadable-"));
  setup = {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    clock: { now: () => new Date("2026-11-22T09:00:00.000Z") },
    // The file system refuses to list the plugins folder, as for one with mode 000 (C630 #1).
    readFolder: (at) => deniedListing(new FileSystemFolderReader(at)),
  };
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** `inner`, except that listing the folder itself fails as Node's `scandir` does without access. */
function deniedListing(inner: FolderReader): FolderReader {
  return {
    location: inner.location,
    entries: async (dir, options) => {
      if (dir !== undefined) return inner.entries(dir, options);
      throw Object.assign(new Error("EACCES: permission denied, scandir"), { code: "EACCES" });
    },
    read: (path) => inner.read(path),
    locationOf: (path) => inner.locationOf(path),
  };
}

verifies("cli.plugins-folder-unreadable", () => {
  it("refuses an unreadable plugins folder with its name and fix, not a bug report", async () => {
    const io = captureIo(folder);

    const code = await runCli(["plugin", "list"], io, [pluginCommandWith(setup)]);

    const plugins = setupPluginsFolder(setup);
    const fix =
      process.platform === "win32"
        ? "Give your user account access to it in the folder's Properties, under Security, then run again."
        : `Run chmod 700 ${plugins}, then run again.`;
    expect(code).toBe(exitCode.denied);
    expect(io.stdout).toEqual([]);
    expect(io.stderr.join("\n")).toContain(
      `✕ Couldn't list the plugins: the plugins folder ${plugins} can't be read by your user account.\n  ${fix}`,
    );
    expect(io.stderr.join("\n")).not.toContain("report it");
  });
});
