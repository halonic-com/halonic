import type { EngineWords } from "@halonicjs/studio-shell";
import { useCallback, useState, useSyncExternalStore } from "react";
import type { AllRunsFeed } from "../app/all-runs-feed.ts";
import { RunsAppList } from "../app/runs-app-list.tsx";
import type { AllRunsRow } from "../app/source-rows.ts";
import { RefreshFailedLine } from "../load-failure.tsx";

/** The lines over the list when a source couldn't be read (decided by the team on HAL-18749). */
export const allRunsWords = {
  sourceFailed: (name: string) => `Couldn't refresh the runs of ${name}`,
  sourcesFailed: "Couldn't list your workspaces and teams",
} as const;

/** Props for {@link RunsAppView}. */
export interface RunsAppViewProps {
  readonly feed: AllRunsFeed;
  readonly engine: EngineWords;
  /** Opens a workflow run's page; an agent's run has no page yet. */
  readonly openRun?: (item: NonNullable<AllRunsRow["item"]>) => void;
  /** The clock for the day headings and today's summary; tests pass a fixed one. */
  readonly now?: () => Date;
  /** The user's IANA time zone; the system's by default. */
  readonly timeZone?: string;
}

/**
 * The Runs app's list on the Runs page, until the Runs window exists
 * (HAL-18749): every workspace's and team's runs from `AllRunsService`, with
 * one line per source that couldn't be read over the list, which keeps that
 * source's last rows and every other source's.
 */
export function RunsAppView({
  feed,
  engine,
  openRun,
  now = () => new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: RunsAppViewProps) {
  const subscribe = useCallback((listener: () => void) => feed.subscribe(listener), [feed]);
  const state = useSyncExternalStore(subscribe, () => feed.state);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const open = (id: string) => {
    setOpened((current) => new Set(current).add(id));
    const item = state.rows.find((row) => row.id === id)?.item;
    if (item !== undefined) openRun?.(item);
  };
  return (
    <div className="flex w-full flex-col gap-2">
      {state.error === undefined ? null : (
        <RefreshFailedLine what={allRunsWords.sourcesFailed} error={state.error} engine={engine} />
      )}
      {state.failures.map((failure) => (
        <RefreshFailedLine
          key={failure.source.id}
          what={allRunsWords.sourceFailed(failure.source.name)}
          error={failure.error}
          engine={engine}
        />
      ))}
      <RunsAppList
        runs={state.rows}
        opened={opened}
        now={now()}
        timeZone={timeZone}
        selected={undefined}
        onOpen={open}
        // The Costs view comes with the Runs app's pane (HAL-18725); until then the summary stays.
        onCosts={() => undefined}
      />
    </div>
  );
}
