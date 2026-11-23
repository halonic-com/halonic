// The other file whose errors stop the workflow from running, which the problems band names
// (C544-3, HAL-15343): taken from the workspace's shared list of files with errors (HAL-14902), so
// the band, the status bar and the lists never disagree about a file.

import { fileItem, requestOpenAtLine } from "@halonicjs/studio-feature-files/api";
import type { FileWithErrors } from "@halonicjs/studio-shell";
import type { WorkflowProblem } from "../api.ts";
import type { MissingAlias } from "./start-row.tsx";

/**
 * The first file of the shared list that holds one of the workflow's errors and isn't its own
 * file, in the list's order: files that didn't load first, as their errors cause the others. The
 * agent of a missing model alias is left out, since the band already names it with its fix.
 *
 * @param hubId - the workflow's hub, where the agent of `missingAlias` is
 */
export function blockingFileOf(
  files: readonly FileWithErrors[],
  problems: readonly WorkflowProblem[],
  hubId: string,
  missingAlias: MissingAlias | undefined,
): FileWithErrors | undefined {
  const paths = new Set(
    problems.flatMap(({ severity, file }) =>
      severity === "error" && file !== undefined ? [file] : [],
    ),
  );
  const isAliasAgent = (one: FileWithErrors) =>
    missingAlias !== undefined &&
    one.kind === "agent" &&
    one.hub === hubId &&
    one.id === missingAlias.agent.id;
  return files.find((one) => paths.has(one.path) && !isAliasAgent(one));
}

/** What **Open *file name*** does: opens the file in Files with the cursor on the given line. */
export function openFileAtLine(
  openItem: (item: ReturnType<typeof fileItem>) => void,
): (path: string, line: number) => void {
  return (path, line) => {
    requestOpenAtLine(path, line);
    openItem(fileItem(path));
  };
}
