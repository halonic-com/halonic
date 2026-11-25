import { glob, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

/** A requirement file in the repo: its path from the repo root, with `/`, and its status. */
export interface RequirementFile {
  readonly path: string;
  readonly status: string;
}

/**
 * The requirement files of the repo at `repo` whose names could hold one of
 * `ids`, by the id their heading names. An id missing from the map has no
 * requirement file.
 */
export async function requirementFiles(
  repo: string,
  ids: readonly string[],
): Promise<Map<string, RequirementFile>> {
  // An id ends with its file's name, so only those files need reading.
  const names = new Set(ids.map((id) => `${id.split(".").at(-1)}.md`));
  const files = new Map<string, RequirementFile>();
  const found = glob("**/requirements/*.md", {
    cwd: repo,
    exclude: (path) => basename(path) === "node_modules" || basename(path) === ".git",
  });
  for await (const file of found) {
    if (!names.has(basename(file))) continue;
    const text = await readFile(join(repo, file), "utf8");
    const id = /^# (\S+)/.exec(text)?.[1];
    const status = /^- Status: (\S+)/m.exec(text)?.[1];
    // The Windows runner's glob answers with `\`; changed paths come from GitHub with `/`.
    const path = file.replaceAll("\\", "/");
    if (id !== undefined) files.set(id, { path, status: status ?? "unknown" });
  }
  return files;
}
