import { StatusChip } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import type { WorkflowStep } from "../api.ts";
import type { Box } from "../canvas/geometry.ts";
import type { StepMark } from "../start/run-strip.ts";
import { startWords } from "../start/start-words.ts";
import { pageWords } from "./page-words.ts";
import { StatusDot } from "./status-dot.tsx";

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
  /** Where the step leads, for a screen reader that can't see the arrows; absent for an end step. */
  readonly waysOn?: string | undefined;
  readonly onSelect: () => void;
  /** Told when the card takes focus, so the canvas can bring it into view. */
  readonly onFocus?: ((event: React.FocusEvent<HTMLButtonElement>) => void) | undefined;
}

/**
 * One step on the canvas (`workflows.page.step-cards`): its kind, its title (its id when it has none), and the agent it runs,
 * or "No agent" for a task step that has none (a step without an agent passes the data on). A
 * click selects it; the docked card that edits it lands with Configuration.
 *
 * A screen reader hears its title first, then its kind, the Start chip, its agent and how it stood
 * in the shown run, and then where it leads (`waysOn`). The card looks the same: only the order it
 * is read in changes (a11y check E1, E3).
 */
export function StepCard({
  step,
  box,
  first,
  selected,
  failed,
  mark,
  focusOnMount,
  waysOn,
  onSelect,
  onFocus,
}: StepCardProps) {
  const button = useRef<HTMLButtonElement>(null);
  // Ids for the parts the card's name is read from, unique to this card on the page.
  const id = useId();
  const part = {
    title: `${id}-title`,
    kind: `${id}-kind`,
    start: `${id}-start`,
    agent: `${id}-agent`,
    mark: `${id}-mark`,
    failed: `${id}-failed`,
    waysOn: `${id}-ways-on`,
  };
  const nameParts = [
    part.title,
    part.kind,
    first && part.start,
    step.type === "task" && part.agent,
    mark !== undefined && part.mark,
    failed === true && part.failed,
  ].filter((partId) => partId !== false);
  useEffect(() => {
    if (focusOnMount) button.current?.focus();
  }, [focusOnMount]);
  const ring = ringOf(failed === true, selected);
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-pressed={selected}
        aria-labelledby={nameParts.join(" ")}
        aria-describedby={waysOn === undefined ? undefined : part.waysOn}
        onClick={onSelect}
        onFocus={onFocus}
        // Dragging the background pans; a press on a card must not start that.
        onPointerDown={(event) => event.stopPropagation()}
        style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
        className={`absolute flex flex-col items-start justify-center gap-0.5 rounded-lg border bg-surface px-3 text-left ${ring}`}
      >
        <span id={part.kind} className="text-caption text-fg-muted">
          {pageWords.stepKind[step.type]}
        </span>
        {first && (
          <span
            id={part.start}
            className="absolute -top-5 left-3 rounded-full border border-border bg-surface px-2 text-caption text-accent-text"
          >
            {pageWords.startChip}
          </span>
        )}
        <span
          id={part.title}
          title={step.title ?? step.id}
          className={`${step.type === "task" ? "truncate" : "line-clamp-2"} w-full min-w-0 break-words text-small font-medium text-fg`}
        >
          {step.title ?? step.id}
        </span>
        {mark !== undefined && (
          <span id={part.mark} className="contents">
            <StatusDot
              mark={mark}
              style={{
                left: box.width - DOT_INSET - DOT / 2 - CARD_BORDER,
                top: DOT_INSET - DOT / 2 - CARD_BORDER,
                width: DOT,
                height: DOT,
              }}
            />
          </span>
        )}
        {failed && (
          <span id={part.failed} className="contents">
            <StatusChip tone="danger">{startWords.failedChip}</StatusChip>
          </span>
        )}
        {step.type === "task" && (
          <span id={part.agent} className="text-small text-fg-muted">
            {step.agent ?? pageWords.noAgent}
          </span>
        )}
      </button>
      {/* Hidden, outside the button so it isn't part of the card's text; a description still reads it. */}
      {waysOn !== undefined && (
        <span id={part.waysOn} hidden>
          {waysOn}
        </span>
      )}
    </>
  );
}

/** How far the Start chip rises above its card's top edge, in px: its `-top-5`. */
const START_CHIP_RISE = 20;

/** All that a card draws, its Start chip included, in the canvas surface's coordinates. */
export function cardExtent(box: Box, first: boolean): Box {
  if (!first) return box;
  return { ...box, y: box.y - START_CHIP_RISE, height: box.height + START_CHIP_RISE };
}

/** The status dot's size and its centre's distance from the card's top-right corner, in px. */
export const DOT = 10;
const DOT_INSET = 14;
/** The card's border width: an absolute child is placed from inside it, `dotCentre` from the outer edge. */
export const CARD_BORDER = 1;

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
