import { EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import { filesWords } from "../files-words.ts";

/** What a file's tab shows in place of the editor while it loads, or when it can't show it. */
export type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "missing" }
  | { readonly kind: "not-text"; readonly size: string }
  | { readonly kind: "ready"; readonly text: string; readonly readOnly: boolean };

/**
 * Moves focus to the Files tree's Tab stop, where the user picks another file: the first tree the
 * person can reach, as a Code page in a tab behind is hidden and inert.
 */
export function goToFiles(): void {
  const stops = document.querySelectorAll<HTMLElement>(
    '[role="tree"][aria-label="Files"] [data-path][tabindex="0"]',
  );
  [...stops].find((stop) => stop.closest("[inert]") === null)?.focus();
}

/**
 * What stands in for the editor while the file loads, is gone, isn't text, or can't be read. A
 * file that can't be read offers **Try again**, which reads it again in the same tab.
 */
export function LoadNotice({
  loaded,
  missing,
  onRetry,
  onGoToFiles = goToFiles,
}: {
  loaded: Loaded;
  missing: boolean;
  onRetry: () => void;
  /** Where **Go to Files** takes the focus; Code's pane gives its own list column's tree. */
  onGoToFiles?: () => void;
}) {
  return (
    <>
      {loaded.kind === "loading" && (
        <div role="status" aria-label={filesWords.fileLoading} className="grid gap-3 p-4">
          <SkeletonBar kind="title" width="2/3" />
          <SkeletonBar kind="title" width="1/2" />
        </div>
      )}
      {missing && (
        <EmptyState
          plain
          title={filesWords.missingTitle}
          action={{ label: filesWords.goToFiles, onClick: onGoToFiles }}
        />
      )}
      {loaded.kind === "not-text" && (
        <EmptyState
          plain
          title={filesWords.notTextTitle}
          description={filesWords.notTextDescription(loaded.size)}
        />
      )}
      {loaded.kind === "ready" && loaded.readOnly && (
        <div
          role="status"
          className="border-b border-border bg-surface-muted px-4 py-1 text-small text-fg"
        >
          {filesWords.largeFile}
        </div>
      )}
      {loaded.kind === "error" && (
        <EmptyState
          tone="error"
          plain
          title={filesWords.unreadableTitle}
          description={loaded.reason}
          action={{ label: filesWords.tryAgain, onClick: onRetry }}
        />
      )}
    </>
  );
}
