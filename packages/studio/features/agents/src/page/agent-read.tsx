import { Button, EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import type { AgentListing } from "../api.ts";
import { pageWords } from "./page-words.ts";
import type { Load } from "./use-load.ts";

/**
 * The agent while it is read, whichever view is open: a skeleton after 300 ms, then "Still
 * loading" with **Try again**, or why it couldn't be read.
 */
export function AgentRead({
  load,
  name,
  retry,
}: {
  readonly load: Load<AgentListing>;
  readonly name: string;
  readonly retry: () => void;
}) {
  if (load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        title={pageWords.loadFailedTitle}
        description={load.reason}
        action={{ label: pageWords.tryAgain, onClick: retry, busy: load.retrying }}
      />
    );
  }
  if (load.kind === "ready" || !load.skeleton) return null;
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">{pageWords.loading(name)}</span>
      <SkeletonBar kind="value" />
      <SkeletonBar kind="value" />
      {load.slow && (
        <p className="flex items-center gap-3 text-small text-fg-muted">
          {pageWords.stillLoading}
          <Button variant="secondary" size="sm" onClick={retry}>
            {pageWords.tryAgain}
          </Button>
        </p>
      )}
    </div>
  );
}
