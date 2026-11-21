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
import { dockedCard } from "./docked-card.ts";
import { runsWords as words } from "./runs-words.ts";
import { SaveAsTest, type SaveAsTestProps } from "./save-as-test.tsx";

/** Props for {@link RunCard}. */
export interface RunCardProps {
  /** The runs feature's source, which the receipt reads the run's log from. */
  readonly source: Pick<
    RunsSource,
    "log" | "workflow" | "currency" | "providerKind" | "providerName" | "models"
  >;
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
   * Run again for the banner of a failed run: how to start it, what to do with the new run and
   * how to read why it didn't start (UX check RA1). Absent where the app can't start runs, and the
   * banner then has no **Run again**.
   */
  readonly runAgain?:
    | {
        readonly runStart: RunStartHost;
        readonly onStarted: (runId: string) => void;
        /** Says why a Run again didn't start to a screen reader, as the run page does. */
        readonly announce?: ((line: string) => void) | undefined;
      }
    | undefined;
  /** Opens Models, at an alias's tab when given one, for the banner's **Open Models**; absent where it can't. */
  readonly openModels?: ((alias?: string) => void) | undefined;
  /** Opens the workspace page at its Budget block, for the banner's **Change budget**; absent where it can't. */
  readonly openBudget?: (() => void) | undefined;
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
  openBudget,
}: RunCardProps) {
  const read = useRunLog(source, run.summary.id, run.summary.lastSeq, run);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  };
  const loading = read.events === undefined && read.failure === undefined;
  return (
    <aside aria-label={words.card(row.shortId)} onKeyDown={onKeyDown} className={dockedCard}>
      {/* In a narrow window the chip goes under the id, and Close stays at the top end. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="text-caption text-fg-muted">{words.cardKind}</p>
            <h2 ref={heading} tabIndex={-1} className="text-title wrap-anywhere">
              {row.shortId}
            </h2>
          </div>
          {loading ? null : (
            <StatusChip tone={row.chip.tone} dot={row.chip.dot}>
              {row.chip.word}
            </StatusChip>
          )}
        </div>
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
        announce={runAgain?.announce}
        openModels={openModels}
        openBudget={openBudget}
      />
      {(onOpenLog || saveAsTest) && (
        <div className="flex flex-wrap gap-2">
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
