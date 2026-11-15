import {
  RunCardReceipt,
  type RunRow,
  type RunsSource,
  type SourcedRun,
} from "@halonicjs/studio-feature-runs/api";
import { Button, CloseIcon, StatusChip } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { runsWords as words } from "./runs-words.ts";
import { SaveAsTest, type SaveAsTestProps } from "./save-as-test.tsx";

/** Props for {@link RunCard}. */
export interface RunCardProps {
  /** The runs feature's source, which the receipt reads the run's log from. */
  readonly source: Pick<RunsSource, "log" | "workflow" | "currency">;
  /** The workspace's runs, to name a child run's workflow. */
  readonly runs: readonly SourcedRun[];
  readonly row: RunRow;
  readonly run: SourcedRun;
  readonly onClose: () => void;
  /** Opens the run's page, where its log is; absent where the app has no run page. */
  readonly onOpenLog?: (() => void) | undefined;
  /** What **Save as test** needs; absent where the host can't write test cases. */
  readonly saveAsTest?: SaveAsTestProps | undefined;
}

/**
 * The run card (UX 10.14, W-D3), docked at the right over the Runs view: the status, who started
 * it, the run's receipt at card width, **Open the run log** and **Save as test**.
 */
export function RunCard({ source, runs, row, run, onClose, onOpenLog, saveAsTest }: RunCardProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  };
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
        <StatusChip tone={row.chip.tone} dot={row.chip.dot}>
          {row.chip.word}
        </StatusChip>
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
      <RunCardReceipt source={source} run={run} runs={runs} />
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
