import { Button, PlusIcon } from "@halonicjs/studio-kit";
import type { Box, Point } from "../canvas/geometry.ts";
import { pageWords } from "./page-words.ts";

const words = pageWords.toolbar;

/** The canvas's grid, in px: a new step's place snaps to it (`bg-canvas-grid`). */
export const GRID = 20;

/** The room between the right-most card and a new step, in px. */
const NEW_STEP_GAP = 40;

/** The room the toolbar takes at the top of the canvas, in px: a fit leaves it free. */
export const TOOLBAR_GUTTER = 52;

/** Props for {@link CanvasToolbar}. */
export interface CanvasToolbarProps {
  readonly onAddStep: (type: "task" | "wait") => void;
  readonly onAutoLayout: () => void;
}

/**
 * The canvas's toolbar at its top left (`workflows.canvas.toolbar`, flow-workflows 3.2): **Step**
 * and **Wait** add a step (heard as "Add step" and "Add wait"), a divider, then **Auto layout**.
 * Each keeps its text in a narrow panel.
 */
export function CanvasToolbar({ onAddStep, onAutoLayout }: CanvasToolbarProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row of buttons, not form fields, so not a fieldset.
    <div
      role="group"
      aria-label={words.label}
      // Tells the canvas a press here isn't on its background, so it doesn't close a step's card.
      data-canvas-controls
      className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-md border border-border bg-surface p-1 shadow-1"
    >
      <Button variant="ghost" size="sm" icon={<PlusIcon />} onClick={() => onAddStep("task")}>
        <Spoken shown={words.step} name={words.addStep} />
      </Button>
      <Button variant="ghost" size="sm" icon={<PlusIcon />} onClick={() => onAddStep("wait")}>
        <Spoken shown={words.wait} name={words.addWait} />
      </Button>
      {/* Forced colours drop backgrounds, so there the divider takes the text's colour. */}
      <span
        aria-hidden="true"
        className="mx-1 h-5 w-px bg-border forced-color-adjust-none forced-colors:bg-[CanvasText]"
      />
      <Button variant="ghost" size="sm" onClick={onAutoLayout}>
        <span className="whitespace-nowrap">{words.autoLayout}</span>
      </Button>
    </div>
  );
}

/**
 * A button's text that shows one thing and is heard as another: "+ Step" reads as an add next to
 * its plus, but a screen reader hears no plus, so it says "Add step". The name holds the shown
 * word, so voice control still finds the button by it (WCAG 2.5.3).
 */
function Spoken({ shown, name }: { readonly shown: string; readonly name: string }) {
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{name}</span>
    </>
  );
}

/**
 * Where a new step goes: to the right of the right-most card, level with it, on the grid
 * (flow-workflows 5.3). On an empty canvas, at the origin.
 */
export function newStepPlace(boxes: Iterable<Box>): Point {
  let rightMost: Box | undefined;
  for (const box of boxes) {
    if (rightMost === undefined || box.x + box.width > rightMost.x + rightMost.width)
      rightMost = box;
  }
  if (rightMost === undefined) return { x: 0, y: 0 };
  return {
    x: snap(rightMost.x + rightMost.width + NEW_STEP_GAP),
    y: snap(rightMost.y),
  };
}

/** The nearest grid line at or after `value`, so a new card never overlaps the one it follows. */
function snap(value: number): number {
  return Math.ceil(value / GRID) * GRID;
}
