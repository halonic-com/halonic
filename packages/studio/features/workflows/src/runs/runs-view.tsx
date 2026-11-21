import type { RunRow, RunsSource, SourcedRun } from "@halonicjs/studio-feature-runs/api";
import {
  Button,
  EmptyState,
  SkeletonBar,
  StatusChip,
  usePresentation,
} from "@halonicjs/studio-kit";
import { type ReactNode, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import type { WorkflowRef } from "../api.ts";
import { RunCard } from "./run-card.tsx";
import { realRunsOf, runRowsOf, runSections } from "./runs-model.ts";
import { runsWords as words } from "./runs-words.ts";
import type { SaveAsTestProps } from "./save-as-test.tsx";
import type { RunsLoad } from "./use-runs.ts";

/** Props for {@link RunsView}. */
export interface RunsViewProps {
  /** The runs feature's lookups for a row: the workflow's step names, the routine, the currency. */
  readonly source: Pick<
    RunsSource,
    "workflow" | "routine" | "currency" | "log" | "providerKind" | "providerName" | "models"
  >;
  /** What {@link useRuns} read; the page reads it so the Runs tab can count the runs that need you. */
  readonly load: RunsLoad;
  readonly retry: () => void;
  readonly workflow: WorkflowRef;
  /** The id of the run whose card is docked; the page keeps it, so its own dock can close this card. */
  readonly picked: string | undefined;
  /** Opens a row's card, or closes it with `undefined`. */
  readonly onPick: (runId: string | undefined) => void;
  /** Opens a run's page, where its log is; absent where the app has no run page. */
  readonly openRun?: ((runId: string) => void) | undefined;
  /** Opens the Inbox on what the run waits on, for the card's **Review in Inbox**; absent where it can't be opened. */
  readonly reviewInInbox?: ((runId: string) => void) | undefined;
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
  picked,
  onPick,
  openRun,
  reviewInInbox,
  seeAll,
  saveAsTest,
}: RunsViewProps) {
  const phone = usePresentation() === "phone";
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const { hubId, id } = workflow;
  const ready = load.kind === "ready" ? load.runs : undefined;
  const rows = useMemo(
    () => (ready ? runRowsOf(ready, { hubId, id }, source, new Date()) : []),
    [ready, hubId, id, source],
  );

  if (load.kind === "failed") {
    return (
      <Inset>
        <EmptyState
          tone="error"
          title={words.loadFailedTitle}
          description={load.reason}
          action={{ label: words.tryAgain, onClick: retry, busy: load.retrying }}
        />
      </Inset>
    );
  }
  if (load.kind === "loading") {
    return load.skeleton ? (
      <Inset>
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
      </Inset>
    ) : null;
  }
  if (rows.length === 0) {
    return (
      <Inset>
        <p className="text-small text-fg-muted">
          {words.emptyBefore}
          <strong>{words.emptyRun}</strong>
          {words.emptyAfter}
        </p>
      </Inset>
    );
  }

  const sections = runSections(rows);
  const open = rows.find((row) => row.id === picked);
  const openRunOf = (row: RunRow): SourcedRun | undefined =>
    realRunsOf(load.runs, workflow).find((run) => run.summary.id === row.id);
  const openedRun = open && openRunOf(open);
  const closeCard = () => {
    // The list shows again first: on a phone it was hidden behind the card, and a hidden row can't take focus.
    flushSync(() => onPick(undefined));
    if (picked !== undefined) rowButtons.current.get(picked)?.focus();
  };
  const section = (title: string, list: readonly RunRow[]) =>
    list.length > 0 && (
      <section aria-label={title} className="flex flex-col gap-1">
        <h2 className="text-caption text-fg-muted">{title}</h2>
        <ul className="flex flex-col divide-y divide-border">
          {list.map((row) => (
            <li key={row.id} className={picked === row.id ? "bg-accent-soft selected-forced" : ""}>
              <button
                type="button"
                ref={(node) => {
                  if (node) rowButtons.current.set(row.id, node);
                  else rowButtons.current.delete(row.id);
                }}
                aria-pressed={picked === row.id}
                aria-label={row.label}
                className="focus-ring flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-start"
                onClick={() => onPick(picked === row.id ? undefined : row.id)}
              >
                {/* In a narrow window the summary and time go on a line under the chip and id,
                    where the summary keeps at least 6rem rather than being cut to nothing. */}
                <span className="flex items-center gap-3">
                  <StatusChip tone={row.chip.tone} dot={row.chip.dot}>
                    {row.chip.word}
                  </StatusChip>
                  <span className="text-small tabular-nums text-fg-muted">{row.shortId}</span>
                </span>
                <span className="flex min-w-0 flex-1 basis-48 items-center gap-3">
                  <span className="min-w-24 flex-1 truncate">{row.line}</span>
                  <span className="text-small text-fg-muted">{row.time}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <>
      {/* On a phone a run's card takes the tab: beside it, the list would have no room. */}
      <Inset hidden={phone && open !== undefined && openedRun !== undefined}>
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
      </Inset>
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
          reviewInInbox={reviewInInbox && (() => reviewInInbox(open.id))}
          saveAsTest={saveAsTest?.(open)}
        />
      )}
    </>
  );
}

/**
 * The column the view's list or state sits in: it scrolls on its own, next to a run's card, and keeps
 * the 24 px inset Configuration and Tests have, as the tab panel around it has none.
 */
function Inset({
  children,
  hidden = false,
}: {
  readonly children: ReactNode;
  readonly hidden?: boolean;
}) {
  return (
    <div
      data-testid="runs-inset"
      className={hidden ? "hidden" : "min-w-0 flex-1 overflow-auto p-6"}
    >
      {children}
    </div>
  );
}
