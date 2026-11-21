import { Button, EmptyState, inlineLinkClasses, SkeletonBar } from "@halonicjs/studio-kit";
import type { AgentListing, AgentUser } from "../api.ts";
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

/** The agent's Runs view: what can be said about its runs, with the way to the Runs page. */
export function AgentRuns({
  name,
  users,
  openRuns,
}: {
  readonly name: string;
  readonly users: Load<readonly AgentUser[]>;
  readonly openRuns?: (() => void) | undefined;
}) {
  return (
    <section aria-label={pageWords.runsHeading} className="flex flex-col gap-2">
      <h2 className="text-caption text-fg-muted">{pageWords.runsHeading}</h2>
      {runsLines(name, users).map((line) => (
        <p key={line} className="text-small text-fg-muted">
          {line}
          {line === pageWords.noRuns && openRuns && (
            <>
              {" "}
              <button type="button" className={inlineLinkClasses} onClick={openRuns}>
                {pageWords.openRuns}
              </button>
            </>
          )}
        </p>
      ))}
    </section>
  );
}

/**
 * What the Runs tab says. A run doesn't say which agent ran in it (R9), so the tab lists none: an
 * agent no workflow runs can't have run, and one that workflows run is pointed to their runs. While
 * the workflows are read it says nothing, and when they can't be read it doesn't guess.
 */
function runsLines(name: string, users: Load<readonly AgentUser[]>): readonly string[] {
  if (users.kind === "loading") return [];
  if (users.kind === "failed") return [pageWords.runsAsAStep(name)];
  if (users.value.length === 0) return [pageWords.noRuns, pageWords.runsInAWorkflow(name)];
  return [
    pageWords.runsInWorkflows(
      name,
      users.value.map((user) => user.name),
    ),
  ];
}
