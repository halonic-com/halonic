import { StatusChip } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import type { WorkflowStep } from "../api.ts";
import type { Box } from "../canvas/geometry.ts";
import { configurationWords } from "../configuration/configuration-words.ts";
import type { CardProblems } from "../configuration/problem-lines.ts";
import type { StepMark } from "../start/run-strip.ts";
import { startWords } from "../start/start-words.ts";
import type { ConnectTarget } from "./connect-port.tsx";
import { pageWords } from "./page-words.ts";
import { StatusDot } from "./status-dot.tsx";

/** Props for {@link StepCard}. */
export interface StepCardProps {
  readonly step: WorkflowStep;
  readonly box: Box;
  /** The first step carries the "Start" chip. */
  readonly first: boolean;
  readonly selected: boolean;
  /** One of the steps the page was opened to outline, such as those that run an agent (flow-workflows 9). */
  readonly outlined?: boolean;
  /** The step the shown run failed in: ringed in danger with its **Failed** chip (D8). */
  readonly failed?: boolean;
  /** How the step stands in the shown run: draws its status dot; absent when it was not reached. */
  readonly mark?: StepMark | undefined;
  /** What the checks found in the step: its border and problem line (flow-workflows 4.4). */
  readonly problems?: CardProblems | undefined;
  /** Take focus on mount, for the card a problem's link opened. */
  readonly focusOnMount?: boolean;
  /** Where the step leads, for a screen reader that can't see the arrows; absent for an end step. */
  readonly waysOn?: string | undefined;
  readonly onSelect: () => void;
  /** Told when the card takes focus, so the canvas can bring it into view. */
  readonly onFocus?: ((event: React.FocusEvent<HTMLButtonElement>) => void) | undefined;
  /** During a drag from another step's port: a drop can land here, or will. */
  readonly connectTarget?: ConnectTarget | undefined;
}

/**
 * One step on the canvas (`workflows.page.step-cards`): its kind, its title (its id when it has none), and the agent it runs,
 * or "No agent" for a task step that has none (a run fails at a step without an agent). A
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
  outlined,
  failed,
  mark,
  problems,
  focusOnMount,
  waysOn,
  onSelect,
  onFocus,
  connectTarget,
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
    problems: `${id}-problems`,
    waysOn: `${id}-ways-on`,
  };
  const nameParts = [
    part.title,
    part.kind,
    first && part.start,
    step.type === "task" && part.agent,
    mark !== undefined && part.mark,
    problems !== undefined && part.problems,
  ].filter((partId) => partId !== false);
  useEffect(() => {
    if (focusOnMount) button.current?.focus();
  }, [focusOnMount]);
  const ring = ringOf(failed === true, selected, problems?.severity, outlined === true);
  const outline = outlineOf(connectTarget);
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-pressed={selected}
        data-step={step.id}
        data-connect-target={connectTarget}
        aria-labelledby={nameParts.join(" ")}
        aria-describedby={waysOn === undefined ? undefined : part.waysOn}
        onClick={onSelect}
        onFocus={onFocus}
        // Dragging the background pans; a press on a card must not start that.
        onPointerDown={(event) => event.stopPropagation()}
        style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
        // Keyboard focus wears Studio's ring with its gap, outside the selection's border (C332 SC1).
        className={`focus-ring absolute flex flex-col items-start justify-center gap-0.5 rounded-lg border bg-surface px-3 text-left ${ring} ${outline}`}
      >
        <span id={part.kind} className="text-caption text-fg-muted">
          {pageWords.stepKind[step.type]}
        </span>
        {first && (
          <span
            id={part.start}
            className="absolute bottom-full left-3 rounded-full border border-border bg-surface px-2 text-caption text-accent-text"
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
          // On the top edge at the right, as Start sits at the left, so the name keeps its line. The
          // dot's word already says "Failed" to a screen reader, so the chip is left out of the
          // card's name and said once (HAL-13100). Its fill is see-through, so it sits on the
          // card's surface over the canvas. Both chips stand on the edge, their bottoms on it whatever
          // their height, so they line up when the first step fails and stay clear of the kind label
          // (HAL-14627).
          <span
            aria-hidden="true"
            className="absolute right-3 bottom-full flex rounded-xs bg-surface"
          >
            <StatusChip tone="danger">{startWords.failedChip}</StatusChip>
          </span>
        )}
        {step.type === "task" && (
          <span id={part.agent} className="text-small text-fg-muted">
            {step.agent ?? pageWords.noAgent}
          </span>
        )}
        {problems !== undefined && <ProblemLine id={part.problems} problems={problems} />}
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

/** The canvas's card for `stepId` inside `within`, so the page can hand it focus back. */
export function stepCardIn(
  within: HTMLElement | null,
  stepId: string,
): HTMLButtonElement | undefined {
  const cards = within?.querySelectorAll<HTMLButtonElement>("button[data-step]") ?? [];
  return [...cards].find((card) => card.getAttribute("data-step") === stepId);
}

/** How far the Start chip rises above its card's top edge, in px: its 16 px height, as it stands on it. */
const START_CHIP_RISE = 16;

/**
 * How far the problem line hangs below its card's bottom edge, in px: the status chip's 20 px
 * least height (`min-h-5`).
 */
const PROBLEM_LINE_DROP = 20;

/** What hangs off a card's edges besides the card itself. */
export interface CardParts {
  /** The first step's Start chip, which stands on its top edge. */
  readonly start: boolean;
  /** A step with a problem's line, which hangs from its bottom edge. */
  readonly problem: boolean;
}

/**
 * All that a card draws, its Start chip and its problem line included, in the canvas surface's
 * coordinates: what panning a card into view has to show (`workflows.canvas.focus-in-view`).
 */
export function cardExtent(box: Box, parts: CardParts): Box {
  const rise = parts.start ? START_CHIP_RISE : 0;
  const drop = parts.problem ? PROBLEM_LINE_DROP : 0;
  return { ...box, y: box.y - rise, height: box.height + rise + drop };
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

/** A step a drop can land on has a light outline; the one under the pointer a stronger one. */
const CONNECT_OUTLINE: Record<ConnectTarget, string> = {
  can: "outline-1 outline-offset-4 outline-accent outline-dashed",
  over: "outline-2 outline-offset-4 outline-accent",
};

function outlineOf(connectTarget: ConnectTarget | undefined): string {
  return connectTarget === undefined ? "" : CONNECT_OUTLINE[connectTarget];
}

/**
 * The problem line (flow-workflows 4.4): "✕ Uses a missing agent" in the colour of the worst
 * problem, with each problem's full message as its tooltip. The card has no room for a fourth line,
 * so the line hangs from its bottom edge at the left, as the Failed chip stands on its top edge at
 * the right. It is at most 80px wide, so it ends before the middle of the edge where the arrows
 * leave; its words are cut short there, never its glyph (Noah, HAL-15171). A screen reader hears
 * the whole line in the card's name, after "Error" or "Warning".
 */
function ProblemLine({ id, problems }: { readonly id: string; readonly problems: CardProblems }) {
  return (
    <span
      id={id}
      title={problems.detail}
      className="absolute top-full left-3 flex max-w-20 rounded-xs bg-surface"
    >
      <StatusChip tone={problems.severity === "error" ? "danger" : "attention"}>
        <span aria-hidden="true" className="shrink-0">{`${problems.glyph} `}</span>
        <span className="sr-only">{configurationWords[problems.severity]}: </span>
        <span className="min-w-0 truncate">{problems.line}</span>
      </StatusChip>
    </span>
  );
}

/**
 * A failed step shows the danger ring over the selection's: the run's outcome is the news (D8). A
 * step with a problem has a border in its colour, which the selection's ring covers while it's picked.
 * An outlined step that isn't picked and has no problem has a dashed accent border, so it doesn't
 * read as the selection.
 */
function ringOf(
  failed: boolean,
  selected: boolean,
  problem: CardProblems["severity"] | undefined,
  outlined: boolean,
): string {
  if (failed) return "border-danger ring-2 ring-danger";
  if (selected) return "border-accent ring-2 ring-accent";
  if (problem === "error") return "border-danger";
  if (problem === "warning") return "border-attention";
  return outlined ? "border-2 border-dashed border-accent" : "border-border";
}
