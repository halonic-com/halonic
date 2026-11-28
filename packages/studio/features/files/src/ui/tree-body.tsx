import type { ReactNode } from "react";
import { filesWords } from "../files-words.ts";

/** The tree under the search field, or the quiet line that says why it has no rows. */
export function TreeBody({
  tree,
  files,
  noProblems,
}: {
  readonly tree: ReactNode;
  readonly files: readonly string[];
  readonly noProblems: boolean;
}) {
  if (noProblems) {
    // Go to Files lands here when the chips leave no row to focus (`files.code-list-chips`).
    return (
      <p data-tree-note tabIndex={-1} className="px-5 py-2 text-small text-fg-muted">
        {filesWords.noProblemFiles}
      </p>
    );
  }
  // `workspace.yaml` alone stays a row, with a quiet line under it and no button: the + is the way in.
  const onlyWorkspaceFile = files.every((path) => path === "workspace.yaml");
  return (
    <>
      {tree}
      {onlyWorkspaceFile && (
        <p className="px-3 py-2 text-small text-fg-muted">
          {filesWords.emptyTitle} {filesWords.emptyDescription}
        </p>
      )}
    </>
  );
}
