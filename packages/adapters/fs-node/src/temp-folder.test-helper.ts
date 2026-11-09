import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
