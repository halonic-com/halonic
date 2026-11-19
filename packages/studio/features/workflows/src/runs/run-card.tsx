import {
  RunCardReceipt,
  type RunRow,
  type RunStartHost,
  type RunsSource,
  type SourcedRun,
  useRunLog,
} from "@halonicjs/studio-feature-runs/api";
import { Button, CloseIcon, StatusChip } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { runsWords as words } from "./runs-words.ts";
import { SaveAsTest, type SaveAsTestProps } from "./save-as-test.tsx";

/** Props for {@link RunCard}. */
export interface RunCardProps {
  /** The runs feature's source, which the receipt reads the run's log from. */
  readonly source: Pick<RunsSource, "log" | "workflow" | "currency" | "providerKind">;
  /** The workspace's runs, to name a child run's workflow. */
  readonly runs: readonly SourcedRun[];
  readonly row: RunRow;
  readonly run: SourcedRun;
  readonly onClose: () => void;
  /** Opens the run's page, where its log is; absent where the app has no run page. */
  readonly onOpenLog?: (() => void) | undefined;
  /** Opens another run's page, for the banner's child-run button; absent where the app has no run page. */
  readonly openRun?: ((runId: string) => void) | undefined;
  /** Opens the Inbox, for the banner's **Review in Inbox**; absent where the app can't. */
  readonly reviewInInbox?: (() => void) | undefined;
  /** What **Save as test** needs; absent where the host can't write test cases. */
  readonly saveAsTest?: SaveAsTestProps | undefined;
  /**
   * Run again for the banner of a failed run: how to start it and what to do with the new run.
   * Absent where the app can't start runs, and the banner then has no **Run again**.
   */
  readonly runAgain?:
    | { readonly runStart: RunStartHost; readonly onStarted: (runId: string) => void }
    | undefined;
  /** Opens the workspace page at Models, for the banner's **Open Models**; absent where it can't. */
  readonly openModels?: (() => void) | undefined;
}

/**
 * The run card (UX 10.14, W-D3), docked at the right over the Runs view: the status, who started
 * it, the run's receipt at card width (its banner, summary and Every step), then **Open the run
 * log** (the footer link to the run's page) and **Save as test**. A failed run's banner offers
 * **Run again** and **Open Models** as the run page does, where the card is given them (UX check R10). Only the toggle inside Every step says **Show the run log**.
 */
export function RunCard({
  source,
  runs,
  row,
  run,
  onClose,
  onOpenLog,
  openRun,
  reviewInInbox,
  saveAsTest,
  runAgain,
  openModels,
}: RunCardProps) {
  const read = useRunLog(source, run.summary.id, run.summary.lastSeq, run);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  };
  const loading = read.events === undefined && read.failure === undefined;
  return (
    <aside
      aria-label={words.card(row.shortId)}
      onKeyDown={onKeyDown}
      className="flex w-120 shrink-0 flex-col gap-4 overflow-auto border-s border-border bg-surface-raised p-6 shadow-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-caption text-fg-muted">{words.cardKind}</p>
          <h2 ref={heading} tabIndex={-1} className="text-title">
            {row.shortId}
          </h2>
        </div>
        {loading ? null : (
          <StatusChip tone={row.chip.tone} dot={row.chip.dot}>
            {row.chip.word}
          </StatusChip>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={<CloseIcon />}
          label={words.closeCard}
          onClick={onClose}
        />
      </div>
      <dl className="flex flex-col gap-3 text-small">
        <div>
          <dt className="text-fg-muted">{words.startedBy}</dt>
          <dd>{row.startedBy}</dd>
        </div>
      </dl>
      <RunCardReceipt
        source={source}
        run={run}
        read={read}
        runs={runs}
        reviewInInbox={reviewInInbox}
        openRun={openRun}
        onOpenStep={onOpenLog}
        runStart={runAgain?.runStart}
        openStartedRun={runAgain?.onStarted}
        openModels={openModels}
      />
      {(onOpenLog || saveAsTest) && (
        <div className="flex gap-2">
          {onOpenLog && (
            <Button variant="secondary" size="sm" onClick={onOpenLog}>
              {words.openLog}
            </Button>
          )}
          {saveAsTest && <SaveAsTest {...saveAsTest} />}
        </div>
      )}
    </aside>
  );
}
