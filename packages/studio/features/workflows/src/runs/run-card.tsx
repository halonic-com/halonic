import type { RunRow, SourcedRun } from "@halonicjs/studio-feature-runs/api";
import { Button, CloseIcon, StatusChip } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { runsWords as words } from "./runs-words.ts";
import { SaveAsTest, type SaveAsTestProps } from "./save-as-test.tsx";

/** Props for {@link RunCard}. */
export interface RunCardProps {
  readonly row: RunRow;
  readonly run: SourcedRun;
  readonly onClose: () => void;
  /** Opens the run's page, where its log is; absent where the app has no run page. */
  readonly onOpenLog?: (() => void) | undefined;
  /** What **Save as test** needs; absent where the host can't write test cases. */
  readonly saveAsTest?: SaveAsTestProps | undefined;
}

/**
 * The simple run card (UX 10.14, W-D3), docked at the right over the Runs view until T8's receipt
 * replaces it: the status, what the run is doing or waits for, who started it, the steps so far,
 * **Open the run log** and **Save as test**.
 */
export function RunCard({ row, run, onClose, onOpenLog, saveAsTest }: RunCardProps) {
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
      <p>{row.line}</p>
      <dl className="flex flex-col gap-3 text-small">
        <div>
          <dt className="text-fg-muted">{words.startedBy}</dt>
          <dd>{row.startedBy}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">{words.stepsSoFar}</dt>
          <dd>{run.summary.statesVisited.join(" → ")}</dd>
        </div>
      </dl>
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
