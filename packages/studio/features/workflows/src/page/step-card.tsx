import { StatusChip } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import type { WorkflowStep } from "../api.ts";
import type { Box } from "../canvas/geometry.ts";
import type { StepMark } from "../start/run-strip.ts";
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
  /** How the step stands in the shown run: draws its status dot; absent when it was not reached. */
  readonly mark?: StepMark | undefined;
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
  mark,
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
        <span className="absolute -top-5 left-3 rounded-full border border-border bg-surface px-2 text-caption text-accent-text">
          {pageWords.startChip}
        </span>
      )}
      <span
        title={step.title ?? step.id}
        className={`${step.type === "task" ? "truncate" : "line-clamp-2"} w-full min-w-0 break-words text-small font-medium text-fg`}
      >
        {step.title ?? step.id}
      </span>
      {mark !== undefined && (
        <span
          data-testid="status-dot"
          data-mark={mark}
          style={{
            left: box.width - DOT_INSET - DOT / 2 - CARD_BORDER,
            top: DOT_INSET - DOT / 2 - CARD_BORDER,
            width: DOT,
            height: DOT,
          }}
          className={`absolute rounded-full ${DOT_COLOUR[mark]}`}
        >
          <span className="sr-only">{startWords.mark[mark]}</span>
        </span>
      )}
      {failed && <StatusChip tone="danger">{startWords.failedChip}</StatusChip>}
      {step.type === "task" && (
        <span className="text-small text-fg-muted">{step.agent ?? pageWords.noAgent}</span>
      )}
    </button>
  );
}

/** The status dot's size and its centre's distance from the card's top-right corner, in px. */
export const DOT = 10;
const DOT_INSET = 14;
/** The card's border width: an absolute child is placed from inside it, `dotCentre` from the outer edge. */
export const CARD_BORDER = 1;

const DOT_COLOUR: Record<StepMark, string> = {
  done: "bg-success",
  running: "bg-accent",
  waiting: "bg-warning",
  failed: "bg-danger",
  stopped: "bg-fg-muted",
};

/** The colour the point of light takes on a step's dot: the dot's own. */
export const DOT_VAR: Record<StepMark, string> = {
  done: "var(--color-success)",
  running: "var(--color-accent)",
  waiting: "var(--color-warning)",
  failed: "var(--color-danger)",
  stopped: "var(--color-fg-muted)",
};

/** Where a step's status dot is centred, in the canvas surface's coordinates. */
export function dotCentre(box: Box) {
  return { x: box.x + box.width - DOT_INSET, y: box.y + DOT_INSET };
}

/** A failed step shows the danger ring over the selection's: the run's outcome is the news (D8). */
function ringOf(failed: boolean, selected: boolean): string {
  if (failed) return "border-danger ring-2 ring-danger";
  return selected ? "border-accent ring-2 ring-accent" : "border-border";
}
