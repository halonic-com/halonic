import { describeFileChange, type FileChange } from "@halonicjs/app";
import type { VcsChange } from "@halonicjs/ports";
import type { ChangesSource } from "./api.ts";
import type { ChangedFile } from "./changes-list.ts";

/** How many changed files' texts are read at the same time. */
const readsAtOnce = 4;

/** What changed in each file, one entry for each path. A file that can't be read is just "Changed". */
export async function describeChanges(
  source: ChangesSource,
  changes: readonly VcsChange[],
): Promise<ChangedFile[]> {
  const firstOfEachPath = [...new Map(changes.map((change) => [change.path, change])).values()];
  const files: ChangedFile[] = [];
  // A few files at a time: every read starts a git process.
  for (let start = 0; start < firstOfEachPath.length; start += readsAtOnce) {
    const batch = firstOfEachPath.slice(start, start + readsAtOnce);
    files.push(...(await Promise.all(batch.map((change) => describeFile(source, change)))));
  }
  return files;
}

async function describeFile(source: ChangesSource, change: VcsChange): Promise<ChangedFile> {
  try {
    const texts = await source.readTexts(change);
    const description = describeFileChange(change.path, texts.before, texts.after);
    return { path: change.path, description, texts };
  } catch {
    return { path: change.path, description: unreadable(change), texts: undefined };
  }
}

/** The one line for a file that couldn't be read as text: only that it is new, deleted or changed. */
function unreadable(change: VcsChange): FileChange {
  let sentence = "Changed";
  if (change.status === "added" || change.status === "untracked") sentence = "New";
  if (change.status === "deleted") sentence = "Deleted";
  return {
    path: change.path,
    kind: undefined,
    lines: [{ id: "item", sentence, parts: [] }],
    described: false,
  };
}
