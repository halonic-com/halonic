import { BackIcon, Button, EmptyState, useNarrow } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import { type ReactNode, useCallback, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { AllRunsFeed } from "../app/all-runs-feed.ts";
import { RunsAppList } from "../app/runs-app-list.tsx";
import { type PaneWays, type RunItem, rowActions, runsPanes } from "../app/runs-panes.ts";
import { RefreshFailedLine } from "../load-failure.tsx";

/** The lines over the list when a source couldn't be read (decided by the team on HAL-18749). */
export const allRunsWords = {
  sourceFailed: (name: string) => `Couldn't refresh the runs of ${name}`,
  sourcesFailed: "Couldn't list your workspaces and teams",
} as const;

/**
 * The content pane's words while no run is open, and its way back in one pane (`runs.list-column`).
 * "Back to Runs" is the shell's back link's wording (HAL-8433).
 */
export const runPaneWords = {
  noRunTitle: "No run open",
  noRunLine: "Pick a run in the list to see its steps.",
  back: "Back to Runs",
} as const;

/** Props for {@link RunsAppView}. */
export interface RunsAppViewProps {
  readonly feed: AllRunsFeed;
  readonly engine: EngineWords;
  /** Draws an open run's page in the content pane; without it the pane stays on its empty state. */
  readonly runPane?: (item: RunItem, ways: PaneWays) => ReactNode;
  /** Opens a run's page in a new tab, for a Ctrl-click, Cmd-click or middle click on its row. */
  readonly openInNewTab?: (item: RunItem) => void;
  /** The clock for the day headings and today's summary; tests pass a fixed one. */
  readonly now?: () => Date;
  /** The user's IANA time zone; the system's by default. */
  readonly timeZone?: string;
}

/**
 * The Runs page in the two-column layout (`runs.list-column`): the list column of every
 * workspace's and team's runs from `AllRunsService`, with one line per source that couldn't be
 * read over the list, and beside it, past a 1px line, the content pane with the run a row opened.
 * In one pane, a phone or a narrow window, the list shows until a run opens, then the run with
 * "Back to Runs", and the focus moves with them.
 */
export function RunsAppView({
  feed,
  engine,
  runPane,
  openInNewTab,
  now = () => new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: RunsAppViewProps) {
  const subscribe = useCallback((listener: () => void) => feed.subscribe(listener), [feed]);
  const state = useSyncExternalStore(subscribe, () => feed.state);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const { onePane, open, listColumn, pane, show, close } = useRunsPanes();
  const panes = runsPanes(onePane, open);
  const actions = rowActions(state.rows, {
    // A run the user has opened leaves Failed (`runs.run-groups`).
    markOpened: (id) => setOpened((current) => new Set(current).add(id)),
    show,
    ...(openInNewTab === undefined ? {} : { openInNewTab }),
  });
  return (
    <div className="flex h-full min-h-0 w-full">
      {panes.list ? (
        <div
          ref={listColumn}
          data-part="list-column"
          className={
            onePane
              ? "flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto"
              : "flex w-[34%] max-w-[380px] shrink-0 flex-col gap-2 overflow-y-auto border-e border-border"
          }
        >
          {state.error === undefined ? null : (
            <RefreshFailedLine
              what={allRunsWords.sourcesFailed}
              error={state.error}
              engine={engine}
            />
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
            selected={open?.id}
            {...actions}
            // The Costs view comes with the Runs app's pane (HAL-18725); until then the summary stays.
            onCosts={() => undefined}
          />
        </div>
      ) : null}
      {panes.run ? (
        <div
          ref={pane}
          data-part="run-pane"
          className="flex min-w-0 flex-1 flex-col overflow-y-auto"
        >
          {onePane ? (
            <div className="px-2 pt-2">
              <Button variant="ghost" size="sm" icon={<BackIcon />} onClick={close}>
                {runPaneWords.back}
              </Button>
            </div>
          ) : null}
          {open === undefined || runPane === undefined ? (
            <EmptyState title={runPaneWords.noRunTitle} description={runPaneWords.noRunLine} />
          ) : (
            runPane(open, { show, close })
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The open run and the panes' focus. In one pane the list and the run replace each other, so the
 * focused row or button would go with them: the focus moves to "Back to Runs" when a run opens,
 * and back to the run's row when it closes, as the Messenger's one pane does.
 */
function useRunsPanes() {
  // The shell says a phone is narrow too.
  const onePane = useNarrow();
  const [open, setOpen] = useState<RunItem | undefined>(undefined);
  const listColumn = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const show = (item: RunItem) => {
    if (!onePane) return setOpen(item);
    flushSync(() => setOpen(item));
    pane.current?.querySelector<HTMLElement>("button")?.focus();
  };
  const close = () => {
    const closed = open?.id;
    flushSync(() => setOpen(undefined));
    if (!onePane || closed === undefined) return;
    const rows = listColumn.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [];
    const row = [...rows].find((each) => each.getAttribute("data-row-id") === closed);
    row?.querySelector<HTMLElement>('[role="gridcell"]')?.focus();
  };
  return { onePane, open, listColumn, pane, show, close };
}
