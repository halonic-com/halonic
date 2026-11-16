import type { RunRow, RunsSource, SourcedRun } from "@halonicjs/studio-feature-runs/api";
import { Button, EmptyState, SkeletonBar, StatusChip } from "@halonicjs/studio-kit";
import { useMemo, useRef, useState } from "react";
import type { WorkflowRef } from "../api.ts";
import { RunCard } from "./run-card.tsx";
import { realRunsOf, runRowsOf, runSections } from "./runs-model.ts";
import { runsWords as words } from "./runs-words.ts";
import type { SaveAsTestProps } from "./save-as-test.tsx";
import type { RunsLoad } from "./use-runs.ts";

/** Props for {@link RunsView}. */
export interface RunsViewProps {
  /** The runs feature's lookups for a row: the workflow's step names, the routine, the currency. */
  readonly source: Pick<RunsSource, "workflow" | "routine" | "currency" | "log" | "providerKind">;
  /** What {@link useRuns} read; the page reads it so the Runs tab can count the runs that need you. */
  readonly load: RunsLoad;
  readonly retry: () => void;
  readonly workflow: WorkflowRef;
  /** Opens a run's page, where its log is; absent where the app has no run page. */
  readonly openRun?: ((runId: string) => void) | undefined;
  /** Opens the Inbox, for the card's **Review in Inbox**; absent where it can't be opened. */
  readonly reviewInInbox?: (() => void) | undefined;
  /** What a row's card needs for **Save as test**; absent where the host can't write test cases, and for a run still going. */
  readonly saveAsTest?: ((row: RunRow) => SaveAsTestProps | undefined) | undefined;
  /** Opens the Runs list, which starts with Test runs off; absent where it can't be opened. */
  readonly seeAll?: (() => void) | undefined;
}

/**
 * The workflow's Runs view (`workflows.runs.runs-view`): real runs only, **Now** (running and waiting) then
 * **Earlier** (the 20 newest), **See all** under them, and a row's simple card docked at the right.
 */
export function RunsView({
  source,
  load,
  retry,
  workflow,
  openRun,
  reviewInInbox,
  seeAll,
  saveAsTest,
}: RunsViewProps) {
  const [picked, setPicked] = useState<string | undefined>();
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const { hubId, id } = workflow;
  const ready = load.kind === "ready" ? load.runs : undefined;
  const rows = useMemo(
    () => (ready ? runRowsOf(ready, { hubId, id }, source, new Date()) : []),
    [ready, hubId, id, source],
  );

  if (load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        title={words.loadFailedTitle}
        description={load.reason}
        action={{ label: words.tryAgain, onClick: retry, busy: load.retrying }}
      />
    );
  }
  if (load.kind === "loading") {
    return load.skeleton ? (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">{words.loading}</span>
        <SkeletonBar kind="value" />
        <SkeletonBar kind="value" />
        {load.slow && (
          <p className="flex items-center gap-3 text-small text-fg-muted">
            {words.stillLoading}
            <Button variant="secondary" size="sm" onClick={retry}>
              {words.tryAgain}
            </Button>
          </p>
        )}
      </div>
    ) : null;
  }
  if (rows.length === 0) {
    return (
      <p className="text-small text-fg-muted">
        {words.emptyBefore}
        <strong>{words.emptyRun}</strong>
        {words.emptyAfter}
      </p>
    );
  }

  const sections = runSections(rows);
  const open = rows.find((row) => row.id === picked);
  const openRunOf = (row: RunRow): SourcedRun | undefined =>
    realRunsOf(load.runs, workflow).find((run) => run.summary.id === row.id);
  const openedRun = open && openRunOf(open);
  const closeCard = () => {
    if (picked !== undefined) rowButtons.current.get(picked)?.focus();
    setPicked(undefined);
  };
  const section = (title: string, list: readonly RunRow[]) =>
    list.length > 0 && (
      <section aria-label={title} className="flex flex-col gap-1">
        <h2 className="text-caption text-fg-muted">{title}</h2>
        <ul className="flex flex-col divide-y divide-border">
          {list.map((row) => (
            <li key={row.id} className={picked === row.id ? "bg-accent-soft" : ""}>
              <button
                type="button"
                ref={(node) => {
                  if (node) rowButtons.current.set(row.id, node);
                  else rowButtons.current.delete(row.id);
                }}
                aria-pressed={picked === row.id}
                aria-label={row.label}
                className="focus-ring flex w-full items-center gap-3 py-2 text-start"
                onClick={() => setPicked(picked === row.id ? undefined : row.id)}
              >
                <StatusChip tone={row.chip.tone} dot={row.chip.dot}>
                  {row.chip.word}
                </StatusChip>
                <span className="text-small tabular-nums text-fg-muted">{row.shortId}</span>
                <span className="min-w-0 flex-1 truncate">{row.line}</span>
                <span className="text-small text-fg-muted">{row.time}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <div className="-m-6 flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-auto p-6">
        <div className="flex max-w-186 flex-col gap-6">
          {section(words.now, sections.now)}
          {section(words.earlier, sections.earlier)}
          {seeAll && (
            <div>
              <Button variant="ghost" size="sm" onClick={seeAll}>
                {words.seeAll}
              </Button>
            </div>
          )}
        </div>
      </div>
      {open && openedRun && (
        <RunCard
          key={open.id}
          source={source}
          runs={load.runs}
          row={open}
          run={openedRun}
          onClose={closeCard}
          onOpenLog={openRun && (() => openRun(open.id))}
          openRun={openRun}
          reviewInInbox={reviewInInbox}
          saveAsTest={saveAsTest?.(open)}
        />
      )}
    </div>
  );
}
