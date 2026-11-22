import type {
  WorkflowGuide,
  WorkflowGuideCard,
  WorkflowGuideLine,
  WorkflowGuideScreen,
} from "@halonicjs/studio-feature-workflows/api";
import { type FirstRun, SUPPORT_WORKFLOW } from "./first-run.ts";
import type { FirstRunStart } from "./first-run-start.ts";
import { guideWords } from "./first-run-words.ts";
import { pickModelWords } from "./pick-model/pick-model-words.ts";

/**
 * The first run's guide on Support reply's page (`first-run.guide-card`, `first-run.run`, first-run-flow
 * 3.2 to 3.4), while the first run is on in the open folder:
 * - the guide card: what Acme's support workflow does, the email, and **Run your first workflow**,
 *   which reads **Run again** after a run that ended without a win, with the change line after
 *   **Cancel run**. The button opens the Pick a model screen; where no run can start, such as a
 *   served page with no engine, it opens the page's Run form as before. The card has no ✕: it goes
 *   at the first win or with **Skip, I'll explore**;
 * - the Pick a model screen in place of the page while it is open (`screen`);
 * - what the first run adds to its run on the page (`run`).
 *
 * `pickModelScreen` is the one screen object, so the page loads its view once.
 */
export function firstRunGuide(
  firstRun: FirstRun,
  start: FirstRunStart,
  pickModelScreen: Omit<WorkflowGuideScreen, "title">,
): WorkflowGuide {
  const screen: WorkflowGuideScreen = { ...pickModelScreen, title: pickModelWords.heading };
  const onSupportReply = (workflowId: string) =>
    firstRun.isOnHere && workflowId === SUPPORT_WORKFLOW;
  return {
    card: (workflow) => {
      const state = firstRun.state;
      if (state.kind !== "on" || !onSupportReply(workflow.id)) return undefined;
      return guideCard(firstRun, start, state.ended === true);
    },
    screen: (workflow) => (firstRun.isPicking && onSupportReply(workflow.id) ? screen : undefined),
    run: (workflow, runId) => (onSupportReply(workflow.id) ? start.additions(runId) : undefined),
    subscribe: (listener) => {
      const stopRun = firstRun.subscribe(listener);
      const stopStart = start.subscribe(listener);
      return () => {
        stopRun();
        stopStart();
      };
    },
  };
}

function guideCard(firstRun: FirstRun, start: FirstRunStart, ended: boolean): WorkflowGuideCard {
  const changed = ended ? start.changedLine : undefined;
  const lines: WorkflowGuideLine[] = [
    { text: guideWords.about },
    { label: guideWords.emailLabel, text: guideWords.email },
    ...(changed === undefined ? [] : [{ text: changed }]),
  ];
  return {
    title: guideWords.title,
    lines,
    action: {
      label: ended ? guideWords.runAgain : guideWords.run,
      again: ended,
      run: (page) => (start.canStart ? firstRun.pickModel() : page.openRunForm()),
    },
  };
}
