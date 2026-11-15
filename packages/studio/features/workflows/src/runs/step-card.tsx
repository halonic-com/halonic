import { Button, CloseIcon } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { runsWords as words } from "./runs-words.ts";
import type { StepInRun } from "./step-in-run.ts";

/** Props for {@link StepInRunCard}. */
export interface StepInRunCardProps {
  readonly stepId: string;
  readonly inRun: StepInRun;
  readonly onClose: () => void;
  /** Opens the run's page, where this step's entry is; absent where the app has no run page. */
  readonly onSeeInAndOut?: (() => void) | undefined;
}

/**
 * The card docked at the right for a picked step while a run is shown (flow-workflows 4.5, "This
 * step in the run"): the step's name and one line on what happened to it in the run, with **See
 * what went in and out ›** unless the step wasn't reached. The line only informs; the card that
 * edits the step lands with Configuration.
 */
export function StepInRunCard({ stepId, inRun, onClose, onSeeInAndOut }: StepInRunCardProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  };
  return (
    <aside
      aria-label={words.stepCard(stepId)}
      onKeyDown={onKeyDown}
      className="flex w-120 shrink-0 flex-col gap-4 overflow-auto border-s border-border bg-surface-raised p-6 shadow-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-caption text-fg-muted">{words.stepKind}</p>
          <h2 ref={heading} tabIndex={-1} className="text-title">
            {stepId}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<CloseIcon />}
          label={words.closeStep}
          onClick={onClose}
        />
      </div>
      <p className={inRun.reached ? undefined : "text-fg-subtle"}>{inRun.line}</p>
      {inRun.reached && onSeeInAndOut && (
        <div>
          <Button variant="ghost" size="sm" onClick={onSeeInAndOut}>
            {words.seeInAndOut}
          </Button>
        </div>
      )}
    </aside>
  );
}
