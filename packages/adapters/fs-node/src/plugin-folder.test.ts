import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type FolderTree, pluginFolderWriterContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FileSystemFolderReader } from "./folder-reader.ts";
import { FileSystemPluginFolder } from "./plugin-folder.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

/** A folder link on Windows is a junction, which needs no special rights. */
const folderLinkType = process.platform === "win32" ? "junction" : "dir";

const encoder = new TextEncoder();

const weather = new Map<string, Uint8Array>([
  ["plugin.yaml", encoder.encode("id: weather\n")],
  ["backend/index.js", encoder.encode("export default {};\n")],
]);

/** A new profile folder holding `plugins`, the plugins folder, so the staging folder beside it is cleaned up too. */
async function profileFolder(): Promise<{ profile: string; root: string }> {
  const profile = await tempFolder();
  const root = join(profile, "plugins");
  await mkdir(root);
  return { profile, root };
}

/**
 * Writes `tree` into `root`. The contract's trees link only to folders and
 * have no special files.
 */
async function writeTree(root: string, tree: FolderTree): Promise<void> {
  for (const [path, content] of Object.entries(tree.files ?? {})) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  for (const path of tree.folders ?? []) await mkdir(join(root, path), { recursive: true });
  for (const [path, target] of Object.entries(tree.links ?? {})) {
    await symlink(target, join(root, path), folderLinkType);
  }
}

pluginFolderWriterContract("file system", async (tree) => {
  const { root } = await profileFolder();
  await writeTree(root, tree);
  return { writer: new FileSystemPluginFolder(root), reader: new FileSystemFolderReader(root) };
});

verifies("fs-node.plugin-folder", () => {
  it("leaves nothing behind in the staging folder beside the plugins folder", async () => {
    const { profile, root } = await profileFolder();
    const writer = new FileSystemPluginFolder(root);
    await writer.place("weather", weather, { replace: false });
    await writer.place("weather", weather, { replace: true });
    await writer.remove("weather");
    expect((await readdir(profile)).sort()).toEqual(["plugins", "plugins.staging"]);
    expect(await readdir(join(profile, "plugins.staging"))).toEqual([]);
    expect(await readdir(root)).toEqual([]);
  });

  it("makes the plugins folder on the first place, and removes nothing when it isn't there", async () => {
    const profile = await tempFolder();
    const writer = new FileSystemPluginFolder(join(profile, "plugins"));
    await writer.remove("weather");
    expect(await writer.place("weather", weather, { replace: false })).toBe("placed");
    expect(await readFile(join(profile, "plugins", "weather", "plugin.yaml"), "utf8")).toBe(
      "id: weather\n",
    );
  });

  it("writes nothing into the plugins folder when the staging folder can't be made", async () => {
    const { profile, root } = await profileFolder();
    await writeFile(join(profile, "blocked"), "a file, not a folder");
    const writer = new FileSystemPluginFolder(root, {
      staging: join(profile, "blocked", "staging"),
    });
    await expect(writer.place("weather", weather, { replace: false })).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });

  it("refuses a path or an id that escapes the plugins folder, and writes nothing anywhere", async () => {
    const { profile, root } = await profileFolder();
    const writer = new FileSystemPluginFolder(root);
    const escaping = new Map([["../escaped.txt", encoder.encode("out")]]);
    await expect(writer.place("weather", escaping, { replace: false })).rejects.toThrow(RangeError);
    await expect(writer.place("..", weather, { replace: false })).rejects.toThrow(RangeError);
    await expect(writer.place("../weather", weather, { replace: false })).rejects.toThrow(
      RangeError,
    );
    await expect(writer.remove("..")).rejects.toThrow(RangeError);
    expect(await readdir(profile)).toEqual(["plugins"]);
    expect(await readdir(root)).toEqual([]);
  });

  it("removes a plugin folder with a link inside it, and leaves what the link points to", async () => {
    const { profile, root } = await profileFolder();
    const outside = join(profile, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "data.txt"), "kept");
    const writer = new FileSystemPluginFolder(root);
    await writer.place("weather", weather, { replace: false });
    await symlink(outside, join(root, "weather", "linked"), folderLinkType);
    await writer.place("weather", weather, { replace: true });
    await symlink(outside, join(root, "weather", "linked"), folderLinkType);
    await writer.remove("weather");
    expect(await readdir(root)).toEqual([]);
    expect(await readFile(join(outside, "data.txt"), "utf8")).toBe("kept");
  });

  it("removes a link at the top to a folder outside, and leaves that folder", async () => {
    const { profile, root } = await profileFolder();
    const outside = join(profile, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "plugin.yaml"), "id: weather\n");
    await symlink(outside, join(root, "weather"), folderLinkType);
    const writer = new FileSystemPluginFolder(root);
    expect(await writer.place("weather", weather, { replace: true })).toBe("taken");
    await writer.remove("weather");
    expect(await readdir(root)).toEqual([]);
    expect(await readFile(join(outside, "plugin.yaml"), "utf8")).toBe("id: weather\n");
  });

  it("shows the location it is given, or the root", () => {
    expect(new FileSystemPluginFolder("/p/plugins", { location: "~/plugins" }).location).toBe(
      "~/plugins",
    );
    expect(new FileSystemPluginFolder("/p/plugins").location).toBe("/p/plugins");
  });
});
