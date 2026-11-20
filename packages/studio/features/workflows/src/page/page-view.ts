/**
 * The page's tabs, the same union as `WorkflowView` in `workflow-page.tsx`. Kept here rather than
 * imported, so this file doesn't import the page that imports it.
 */
type WorkflowView = "flow" | "configuration" | "runs";

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
 * takes the page's body, so the panel hides behind it: beside the card it would have no room.
 */
export function panelClass(
  view: WorkflowView,
  { phone, docked }: { readonly phone: boolean; readonly docked: boolean },
): string {
  if (phone && docked) return "hidden";
  switch (view) {
    case "flow":
      return "flex min-h-0 min-w-0 flex-1 flex-col";
    case "runs":
      return "flex min-h-0 min-w-0 flex-1";
    case "configuration":
      return "min-w-0 flex-1 overflow-auto";
  }
}
