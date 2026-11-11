// The Try it source for one item's run (HAL-3277): what it leaves out of
// that run, and the steps it can't try because of that, found before the
// run starts so they go on its `run.started` event.

import type { CantTryStep } from "@halonicjs/events";
import { loadWorkspace, placeOf } from "@halonicjs/workspace";
import type { ReviewFiles } from "./review-files.ts";
import type { LeftOutFile, TryItSource } from "./review-types.ts";
import { cantTryAtLoad } from "./try-it-cant-try.ts";
import { cantTryForPrograms } from "./try-it-programs.ts";
import { runFilesOf } from "./try-it-run-files.ts";
import { buildTryItSource, FileReads, leftOutOf } from "./try-it-source.ts";

/**
 * The Try it source for a run of `item`: the whole workspace as Try it
 * reads it, with `leftOut` kept to the files that run reads, and the steps
 * it can't try. It loads the workspace twice, as it is and as Try it reads
 * it, to compare them, from one read of each file: a save in between
 * can't show up as a difference.
 *
 * @param item - the path of the workflow or agent being tried
 * @param pinned - the ids of the connectors the trust record pins
 * @throws what `loadWorkspace` throws, such as for a file the account may not read
 */
export async function buildTryItRun(
  files: ReviewFiles,
  item: string,
  pinned: ReadonlySet<string>,
): Promise<TryItSource> {
  const reads = FileReads.shared(files);
  try {
    const { source, leftOut } = await buildTryItSource(files, reads);
    const workspace = await loadWorkspace(reads.asIs());
    const tried = await loadWorkspace(source);
    const runFiles = runFilesOf([workspace, tried], item);
    // A file that isn't an item may be read by any command the run starts,
    // so it is counted for every run.
    const readByRun = (file: LeftOutFile) =>
      runFiles.all.has(file.path) || placeOf(file.path) === undefined;
    return {
      source,
      leftOut: leftOutOf(leftOut.files.filter(readByRun)),
      cantTry: cantTryOf(
        cantTryAtLoad({ item, workspace, tried, runFiles, leftOut: leftOut.files }),
        cantTryForPrograms({ item, tried, runFiles, leftOut: leftOut.files, pinned }),
      ),
    };
  } finally {
    reads.close();
  }
}

/**
 * The steps that can't be tried for either cause, each entry once. When
 * the whole item can't be tried, that is the one entry.
 */
function cantTryOf(atLoad: CantTryStep[], forPrograms: CantTryStep[]): CantTryStep[] {
  if (atLoad.some((entry) => entry.step === null)) {
    return atLoad;
  }
  const entries = new Map<string, CantTryStep>();
  for (const entry of [...atLoad, ...forPrograms]) {
    entries.set(JSON.stringify(entry), entry);
  }
  return [...entries.values()];
}
