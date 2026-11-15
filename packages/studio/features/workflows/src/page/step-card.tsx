import type { WorkflowStep } from "../api.ts";
import type { Box } from "../canvas/geometry.ts";
import { pageWords } from "./page-words.ts";

/** Props for {@link StepCard}. */
export interface StepCardProps {
  readonly step: WorkflowStep;
  readonly box: Box;
  /** The first step carries the "Start" chip. */
  readonly first: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

/**
 * One step on the canvas (`workflows.page.step-cards`): its kind, its id, and the agent it runs,
 * or "No agent" for a task step that has none (a step without an agent passes the data on). A
 * click selects it; the docked card that edits it lands with Configuration.
 */
export function StepCard({ step, box, first, selected, onSelect }: StepCardProps) {
  const ring = selected ? "border-accent ring-2 ring-accent" : "border-border";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      // Dragging the background pans; a press on a card must not start that.
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      className={`absolute flex flex-col items-start justify-center gap-0.5 rounded-lg border bg-surface px-3 text-left ${ring}`}
    >
      <span className="text-caption text-fg-muted">{pageWords.stepKind[step.type]}</span>
      <span className="flex items-center gap-2 text-small-strong text-fg">
        {step.id}
        {first && <span className="text-caption text-accent-text">{pageWords.startChip}</span>}
      </span>
      {step.type === "task" && (
        <span className="text-small text-fg-muted">{step.agent ?? pageWords.noAgent}</span>
      )}
    </button>
  );
}
