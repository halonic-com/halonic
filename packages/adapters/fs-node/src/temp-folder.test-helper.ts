import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { FolderTree } from "@halonicjs/testing-contracts";

const folders: string[] = [];

/** A new empty folder under the system's temporary folder, removed by {@link removeTempFolders}. */
export async function tempFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "halonic-fs-node-"));
  folders.push(folder);
  return folder;
}

/** Writes `files` under `root` as they are, private ones included, creating folders as needed. */
export async function writeFiles(
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
}

/** Removes every folder {@link tempFolder} made; tests call it in `afterAll`. */
export async function removeTempFolders(): Promise<void> {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
}

export const onWindows = process.platform === "win32";

/** A folder link on Windows is a junction, which needs no special rights. */
export const folderLinkType = onWindows ? "junction" : "dir";

/** Writes `tree` into a new temporary folder, links and special files included. */
export async function folderOf(tree: FolderTree): Promise<string> {
  const root = await tempFolder();
  await writeTree(root, tree);
  return root;
}

/** Writes `tree` into `root`, links and special files included, creating folders as needed. */
export async function writeTree(root: string, tree: FolderTree): Promise<void> {
  for (const [path, content] of Object.entries(tree.files ?? {})) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  for (const path of tree.folders ?? []) await mkdir(join(root, path), { recursive: true });
  for (const [path, target] of Object.entries(tree.links ?? {})) {
    const link = join(root, path);
    await mkdir(dirname(link), { recursive: true });
    const isFile = tree.files?.[resolvedTarget(path, target)] !== undefined;
    await symlink(target, link, isFile ? "file" : folderLinkType);
  }
  for (const path of tree.special ?? []) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await promisify(execFile)("mkfifo", [join(root, path)]);
  }
}

/** Where a link at `path` to the relative `target` points, as a path in the tree. */
function resolvedTarget(path: string, target: string): string {
  return resolve("/", dirname(path), target).slice(1).replaceAll("\\", "/");
}
