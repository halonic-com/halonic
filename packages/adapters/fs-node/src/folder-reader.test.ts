import { execFile } from "node:child_process";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { type FolderTree, folderReaderContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FileSystemFolderReader } from "./folder-reader.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const onWindows = process.platform === "win32";

/** A folder link on Windows is a junction, which needs no special rights. */
const folderLinkType = onWindows ? "junction" : "dir";

/** Writes `tree` into a new temporary folder, links and special files included. */
async function folderOf(tree: FolderTree): Promise<string> {
  const root = await tempFolder();
  for (const [path, content] of Object.entries(tree.files ?? {})) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  for (const path of tree.folders ?? []) await mkdir(join(root, path), { recursive: true });
  for (const [path, target] of Object.entries(tree.links ?? {})) {
    const link = join(root, path);
    await mkdir(dirname(link), { recursive: true });
    const isFile = (tree.files ?? {})[resolvedTarget(path, target)] !== undefined;
    await symlink(target, link, isFile ? "file" : folderLinkType);
  }
  for (const path of tree.special ?? []) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await promisify(execFile)("mkfifo", [join(root, path)]);
  }
  return root;
}

/** Where a link at `path` to the relative `target` points, as a path in the tree. */
function resolvedTarget(path: string, target: string): string {
  return resolve("/", dirname(path), target).slice(1).replaceAll("\\", "/");
}

folderReaderContract(
  "file system",
  async (tree) => new FileSystemFolderReader(await folderOf(tree)),
  {
    specialFiles: !onWindows,
  },
);

verifies("fs-node.folder-reader", () => {
  it("gives the real path of the folder and of an entry", async () => {
    const root = await folderOf({ files: { "acme/plugin.yaml": "id: acme\n" } });
    const reader = new FileSystemFolderReader(root, "~/plugins");
    expect(reader.location).toBe("~/plugins");
    const real = await reader.locationOf();
    expect(await reader.locationOf("acme")).toBe(join(real ?? "", "acme"));
  });

  it("reaches the folder through a link above it, and still refuses links inside", async () => {
    const root = await folderOf({ files: { "acme/plugin.yaml": "id: acme\n" } });
    const above = join(await tempFolder(), "plugins");
    await symlink(root, above, folderLinkType);
    const reader = new FileSystemFolderReader(above);
    expect(await reader.entries()).toEqual([
      { path: "acme", kind: "folder" },
      { path: "acme/plugin.yaml", kind: "file", size: 9 },
    ]);
    expect(await reader.read("acme/plugin.yaml")).toEqual(new TextEncoder().encode("id: acme\n"));
    expect(await reader.locationOf()).toBe(await new FileSystemFolderReader(root).locationOf());
  });

  it("lists nothing, and locates nothing, for a folder that isn't there", async () => {
    const reader = new FileSystemFolderReader(join(await tempFolder(), "missing"));
    expect(await reader.entries()).toEqual([]);
    expect(await reader.locationOf()).toBeNull();
    expect(await reader.locationOf("acme")).toBeNull();
  });

  it("leaves out an entry removed while the folder is listed", async () => {
    const root = await folderOf({ files: { "acme/plugin.yaml": "id: acme\n" } });
    const reader = new FileSystemFolderReader(root);
    await rm(join(root, "acme"), { recursive: true });
    expect(await reader.entries()).toEqual([]);
    expect(await reader.read("acme/plugin.yaml")).toBeNull();
  });
});
