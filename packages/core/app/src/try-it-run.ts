// The Try it source for one item's run (HAL-3277): what it leaves out of
// that run, and the steps it can't try because of that, found before the
// run starts so they go on its `run.started` event.

import { loadWorkspace } from "@halonicjs/workspace";
import type { ReviewFiles } from "./review-files.ts";
import type { TryItSource } from "./review-types.ts";
import { cantTryAtLoad } from "./try-it-cant-try.ts";
import { runFilesOf } from "./try-it-run-files.ts";
import { buildTryItSource, leftOutOf } from "./try-it-source.ts";

/**
 * The Try it source for a run of `item`: the whole workspace as Try it
 * reads it, with `leftOut` kept to the files that run reads, and the steps
 * it can't try. It loads the workspace twice, as it is and as Try it reads
 * it, to compare them.
 *
 * @param item - the path of the workflow or agent being tried
 * @throws what `loadWorkspace` throws, such as for a file the account may not read
 */
export async function buildTryItRun(files: ReviewFiles, item: string): Promise<TryItSource> {
  const { source, leftOut } = await buildTryItSource(files);
  const workspace = await loadWorkspace(files.store);
  const tried = await loadWorkspace(source);
  const runFiles = runFilesOf([workspace, tried], item);
  return {
    source,
    leftOut: leftOutOf(leftOut.files.filter((file) => runFiles.all.has(file.path))),
    cantTry: cantTryAtLoad({ item, workspace, tried, runFiles, leftOut: leftOut.files }),
  };
}
