import type { WorkflowStep } from "../api.ts";
import type { StepNames } from "../configuration/problem-lines.ts";
import { besideDockedCard } from "../runs/docked-card.ts";
import { pageWords } from "./page-words.ts";

/**
 * The page's tabs, the same union as `WorkflowView` in `workflow-page.tsx`. Kept here rather than
 * imported, so this file doesn't import the page that imports it.
 */
type WorkflowView = "flow" | "configuration" | "runs";

/**
 * How the page names a step in a problem: as its card on the canvas does. A step the page hasn't
 * read yet (`steps` absent while the workflow loads) keeps its id.
 */
export function stepNamesOf(
  steps: readonly Pick<WorkflowStep, "id" | "title">[] | undefined,
): StepNames {
  return (stepId) => {
    const step = steps?.find((one) => one.id === stepId);
    return step === undefined ? stepId : pageWords.stepCard.title(step);
  };
}

/** The tab a page opens on: Configuration when asked for its Tests, else Flow. */
export function firstView(startOnTests: boolean | undefined): WorkflowView {
  return startOnTests ? "configuration" : "flow";
}

/** What Configuration starts with: Tests with no test picked when asked for them, else General. */
export function firstTestsPick(startOnTests: boolean | undefined) {
  return startOnTests ? { name: undefined, n: 0 } : undefined;
}

/**
 * The tab panel's layout: Flow fills it with the canvas, Runs with its list and a run's card side by
 * side (each scrolls and keeps its own inset), and Configuration scrolls. On a phone a docked card
 * takes the page's body, so the panel hides behind it: beside the card it would have no room. So
 * it does on a desktop body under 800 px, as at 200 % zoom (DW1).
 */
export function panelClass(
  view: WorkflowView,
  { phone, docked }: { readonly phone: boolean; readonly docked: boolean },
): string {
  if (phone && docked) return "hidden";
  const layout = viewLayout(view);
  return docked ? `${layout} ${besideDockedCard}` : layout;
}

/** The panel's layout for one tab, with no card docked. */
function viewLayout(view: WorkflowView): string {
  switch (view) {
    case "flow":
      return "flex min-h-0 min-w-0 flex-1 flex-col";
    case "runs":
      return "flex min-h-0 min-w-0 flex-1";
    case "configuration":
      return "min-w-0 flex-1 overflow-auto";
  }
}
