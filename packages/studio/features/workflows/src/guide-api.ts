/**
 * The guide another feature gives the workflow page, such as the first run's: a card at the right
 * of the canvas, and a screen in place of the page. Kept apart from `api.ts` so that file stays
 * small; other features import these through `api.ts`.
 */
import { type ServiceKey, serviceKey, type ViewRef } from "@halonicjs/studio-shell";
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

/** What the workflow page gives a guide's screen view. */
export interface WorkflowGuideScreenProps {
  /** The workflow whose page the screen stands in for. */
  readonly workflow: WorkflowRef;
  /** Whether the page is drawn for a phone. */
  readonly phone: boolean;
  /**
   * Shows a run on this workflow's page once the screen is gone, docked as a run started from the
   * page's Run form is, with the point of light on the drawing: the run the screen started.
   */
  readonly showRun: (runId: string) => void;
}

/**
 * A screen a guide shows in place of a workflow's page, such as the first run's Pick a model
 * (first-run-flow 3.3). Its view is a component taking {@link WorkflowGuideScreenProps}, loaded
 * when it first shows. The screen has no way out of its own on the page: the guide decides when
 * it goes, and the page then comes back as it was.
 */
export interface WorkflowGuideScreen extends ViewRef {
  /** The screen's name, which the page announces when it shows, such as "Pick a model". */
  readonly title: string;
}

/**
 * What a guide adds while one of the workflow's runs shows on its page, such as the first run's
 * (first-run-flow 3.4). The page keeps its own parts; the guide only adds these.
 */
export interface WorkflowGuideRun {
  /**
   * Quiet lines under the run card's status, shown while the guide gives them, such as "Changed 1
   * line in models.yaml: Agents now use Anthropic." as the run starts.
   */
  readonly notes: readonly string[];
  /**
   * A caption under the drawing, such as "Each box is an agent or a rule. You can change all of
   * it later: it's plain files."
   */
  readonly caption?: string | undefined;
  /**
   * **Pick another model**, for a model that is slow or failed. With it the run card says what the
   * run waits for, escalates that line on a model, offers the button on a failure, and once the
   * run waits for the person says "Waiting for you. It's in your Inbox." with **Open Inbox**;
   * without it the card is as it always is.
   */
  readonly pickAnotherModel?: (() => void) | undefined;
  /**
   * Whether the guide took the run off the page, such as after the first run's **Cancel run**:
   * the page then closes the run's card, so the guide's own card shows again.
   */
  readonly dismissed?: boolean | undefined;
}

/**
 * A card another feature shows at the right of a workflow's canvas, such as the first run's guide
 * card (first-run-flow 3.2). The page shows it on Flow while no start, run or step card is docked there,
 * and above the canvas on a phone. It has no ✕: the feature that gives it decides when it goes.
 */
export interface WorkflowGuide {
  /** The card for this workflow now, or `undefined` for none. */
  card(workflow: WorkflowRef): WorkflowGuideCard | undefined;
  /**
   * The screen to show in place of this workflow's page now, or `undefined` for the page itself.
   * Give the same object while the screen stays, so the page doesn't load and draw it afresh.
   */
  screen?(workflow: WorkflowRef): WorkflowGuideScreen | undefined;
  /** What the guide adds while the run `runId` shows on this workflow's page, or `undefined` for nothing. */
  run?(workflow: WorkflowRef, runId: string): WorkflowGuideRun | undefined;
  /**
   * Calls `listener` whenever a card, a screen or a run's additions may have changed. Returns a function that stops
   * the calls.
   */
  subscribe(listener: () => void): () => void;
}

/** The guide on workflow pages, provided by another feature, such as First Run (`workflows.guide`). */
export const WorkflowGuideService: ServiceKey<WorkflowGuide> =
  serviceKey<WorkflowGuide>("workflows.guide");
