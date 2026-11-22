/**
 * The guide card another feature shows on a workflow's page, such as the first run's. Kept apart
 * from `api.ts` so that file stays small; other features import these through `api.ts`.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { WorkflowRef } from "./api.ts";

/**
 * One line of a guide card: plain text, or, with a label ("The email"), a quote in an inset box
 * with the label small above it.
 */
export interface WorkflowGuideLine {
  readonly label?: string | undefined;
  readonly text: string;
}

/** What the guide card's one button can ask of the workflow's page. */
export interface WorkflowGuidePage {
  /**
   * Opens the page's Run form at the right, as the page's own **Run** does, and like it does nothing
   * while the workflow can't run (no Run, the sandbox can't start, or the files refuse the run).
   */
  openRunForm(): void;
}

/** A guide card as the workflow's page shows it: a title, its lines and one primary button. */
export interface WorkflowGuideCard {
  /** The card's heading, such as "Your first run". */
  readonly title: string;
  readonly lines: readonly WorkflowGuideLine[];
  readonly action: {
    /** The button's words, such as "Run your first workflow". */
    readonly label: string;
    /** It runs something again ("Run again"): the button shows the refresh mark instead of ›. */
    readonly again?: boolean | undefined;
    run(page: WorkflowGuidePage): void;
  };
}

/**
 * A card another feature shows at the right of a workflow's canvas, such as the first run's guide
 * card (first-run-flow 3.2). The page shows it on Flow while no start, run or step card is docked there,
 * and above the canvas on a phone. It has no ✕: the feature that gives it decides when it goes.
 */
export interface WorkflowGuide {
  /** The card for this workflow now, or `undefined` for none. */
  card(workflow: WorkflowRef): WorkflowGuideCard | undefined;
  /** Calls `listener` whenever a card may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** The guide on workflow pages, provided by another feature, such as First Run (`workflows.guide`). */
export const WorkflowGuideService: ServiceKey<WorkflowGuide> =
  serviceKey<WorkflowGuide>("workflows.guide");
