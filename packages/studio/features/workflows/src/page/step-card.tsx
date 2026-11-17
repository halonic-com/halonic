import { StatusChip } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import type { WorkflowStep } from "../api.ts";
import type { Box } from "../canvas/geometry.ts";
import { startWords } from "../start/start-words.ts";
import { pageWords } from "./page-words.ts";

/** Props for {@link StepCard}. */
export interface StepCardProps {
  readonly step: WorkflowStep;
  readonly box: Box;
  /** The first step carries the "Start" chip. */
  readonly first: boolean;
  readonly selected: boolean;
  /** The step the shown run failed in: ringed in danger with its **Failed** chip (D8). */
  readonly failed?: boolean;
  /** Take focus on mount, for the card a problem's link opened. */
  readonly focusOnMount?: boolean;
  readonly onSelect: () => void;
}

/**
 * One step on the canvas (`workflows.page.step-cards`): its kind, its title (its id when it has none), and the agent it runs,
 * or "No agent" for a task step that has none (a step without an agent passes the data on). A
 * click selects it; the docked card that edits it lands with Configuration.
 */
export function StepCard({
  step,
  box,
  first,
  selected,
  failed,
  focusOnMount,
  onSelect,
}: StepCardProps) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) button.current?.focus();
  }, [focusOnMount]);
  const ring = ringOf(failed === true, selected);
  return (
    <button
      ref={button}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      // Dragging the background pans; a press on a card must not start that.
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      className={`absolute flex flex-col items-start justify-center gap-0.5 rounded-lg border bg-surface px-3 text-left ${ring}`}
    >
      <span className="text-caption text-fg-muted">{pageWords.stepKind[step.type]}</span>
      {first && (
        <span className="absolute -top-2.5 left-3 rounded-full border border-border bg-surface px-2 text-caption text-accent-text">
          {pageWords.startChip}
        </span>
      )}
      <span className="text-small-strong text-fg">{step.title ?? step.id}</span>
      {failed && <StatusChip tone="danger">{startWords.failedChip}</StatusChip>}
      {step.type === "task" && (
        <span className="text-small text-fg-muted">{step.agent ?? pageWords.noAgent}</span>
      )}
    </button>
  );
}

/** A failed step shows the danger ring over the selection's: the run's outcome is the news (D8). */
function ringOf(failed: boolean, selected: boolean): string {
  if (failed) return "border-danger ring-2 ring-danger";
  return selected ? "border-accent ring-2 ring-accent" : "border-border";
}
