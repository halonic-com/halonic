import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ToolFolders } from "./folders.ts";

/** A temp folder with a working folder, a test log folder and a folder outside both. */
export interface TestFolders extends ToolFolders {
  /** A folder next to the working folder, which no tool may read. */
  readonly outside: string;
  /** Writes a file in the working folder, making the folders on its way. */
  write(path: string, text: string | Uint8Array): Promise<string>;
}

const made: string[] = [];

/** Removes every folder {@link testFolders} made; each test file runs it after each test. */
export async function removeTestFolders(): Promise<void> {
  await Promise.all(made.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
}

/** Makes fresh folders for one test, until {@link removeTestFolders} removes them. */
export async function testFolders(): Promise<TestFolders> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "coding-tools-")));
  made.push(root);
  const workingFolder = join(root, "work");
  const testLogFolder = join(root, "logs");
  const outside = join(root, "outside");
  await Promise.all([workingFolder, testLogFolder, outside].map((folder) => mkdir(folder)));
  return {
    workingFolder,
    testLogFolder,
    outside,
    async write(path, text) {
      const file = join(workingFolder, ...path.split("/"));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, text);
      return file;
    },
  };
}

/** `count` numbered lines: `line 1`, `line 2` and so on. */
export function numberedLines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");
}
