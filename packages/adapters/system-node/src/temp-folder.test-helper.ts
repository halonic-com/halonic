import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const folders: string[] = [];

/** A new empty folder under the system's temporary folder, removed by {@link removeTempFolders}. */
export async function tempFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "halonic-system-node-"));
  folders.push(folder);
  return folder;
}

/** Writes a file of `bytes` bytes at `path`, making the folders above it. */
export async function writeSizedFile(path: string, bytes: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.alloc(bytes));
}

/** Removes every folder {@link tempFolder} made; tests call it in `afterAll`. */
export async function removeTempFolders(): Promise<void> {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
}
