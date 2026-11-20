import { shortRunId } from "@halonicjs/app";
import { EmptyState, List } from "@halonicjs/studio-kit";
import { type EngineWords, ItemGone, PageBackLinkSlot } from "@halonicjs/studio-shell";
import { type Ref, useEffect, useState } from "react";
import { FailureReason } from "../load-failure.tsx";
import { runPageWords } from "../run-words.ts";
import type { RunsList } from "../runs-list.ts";

/**
 * The page while the run isn't shown: the gone page once the runs loaded again haven't got it,
 * else the `h1` over skeleton bars, or "Couldn't load run" when the runs didn't load.
 */
export function RunNotShown({
  runId,
  gone,
  error,
  phone,
  engine,
  page,
  retry,
  goToRuns,
}: {
  readonly runId: string;
  readonly gone: boolean;
  readonly error: unknown;
  readonly phone: boolean;
  readonly engine: EngineWords;
  readonly page: Ref<HTMLDivElement>;
  readonly retry: () => void;
  readonly goToRuns: (() => void) | undefined;
}) {
  if (gone && error === undefined) {
    return <RunNotHere goToRuns={goToRuns} />;
  }
  const title = runPageWords.title(shortRunId(runId));
  return (
    // The page's ref here too, so focus on this `h1` moves to the run's once it shows.
    <div ref={page} className={`flex w-full flex-col gap-4 ${phone ? "px-4 py-4" : "px-6 py-5"}`}>
      <PageBackLinkSlot />
      <h1 className={phone ? "sr-only" : "text-title"}>{title}</h1>
      {error === undefined ? (
        <List
          label={title}
          rows={[]}
          loading
          loadingLabel={runPageWords.loading(shortRunId(runId))}
          onRetry={retry}
        />
      ) : (
        <EmptyState
          tone="error"
          align="start"
          title={runPageWords.loadFailed(shortRunId(runId))}
          description={
            <FailureReason
              what={runPageWords.loadFailed(shortRunId(runId))}
              error={error}
              engine={engine}
            />
          }
          action={{ label: "Try again", onClick: retry }}
        />
      )}
    </div>
  );
}

/**
 * Whether the run is gone: the loaded list hasn't got it (`missing`), and neither has the list
 * loaded again after that. A run that has only just started, as **Run again** opens it, isn't in
 * the list until a refresh reads its folder, so the page waits for one before it says the run
 * isn't there.
 */
export function useRunGone(list: RunsList, runId: string, missing: boolean): boolean {
  const [checked, setChecked] = useState<string>();
  useEffect(() => {
    if (!missing) return;
    let current = true;
    void list.refresh().then(() => {
      if (current) setChecked(runId);
    });
    return () => {
      current = false;
    };
  }, [list, runId, missing]);
  return missing && checked === runId;
}

/** A run that isn't in the workspace (any more): the shell's gone page when it can open the list. */
function RunNotHere({ goToRuns }: { readonly goToRuns: (() => void) | undefined }) {
  return goToRuns === undefined ? (
    <EmptyState title={runPageWords.notHere} />
  ) : (
    <ItemGone kindName="run" place="Runs" onGoTo={goToRuns} />
  );
}
