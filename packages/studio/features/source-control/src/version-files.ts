import { describeFileChange } from "@halonicjs/app";
import type { ChangesSource } from "./api.ts";
import type { ChangedFile } from "./changes-list-state.ts";

/** How many files are read at the same time. */
const readsAtOnce = 4;

/**
 * A version's files, each with the name its file gives it now, for History to group into the items
 * the Changes list would show (`orderItems`): an item has the same name, kind and icon in both. An
 * item deleted since, or a file that can't be read, is named by its id.
 *
 * @example
 * orderItems(await versionFiles(source, ["hubs/reports/workflows/weekly-report.workflow.yaml"]));
 * // [{ name: "Weekly report", kind: "workflow", … }]
 */
export async function versionFiles(
  source: ChangesSource,
  paths: readonly string[],
): Promise<ChangedFile[]> {
  const files: ChangedFile[] = [];
  // A few files at a time, as the list reads its changes.
  for (let start = 0; start < paths.length; start += readsAtOnce) {
    const batch = paths.slice(start, start + readsAtOnce);
    files.push(...(await Promise.all(batch.map((path) => namedFile(source, path)))));
  }
  return files;
}

async function namedFile(source: ChangesSource, path: string): Promise<ChangedFile> {
  try {
    return fileOf(path, await source.readFile(path));
  } catch {
    return fileOf(path, null);
  }
}

/** A file of a version, with the name its text gives it now; no change is described. */
function fileOf(path: string, text: string | null): ChangedFile {
  return { path, description: describeFileChange(path, text, text), texts: undefined };
}
