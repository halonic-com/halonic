import type { WorkflowGuide, WorkflowGuideCard } from "@halonicjs/studio-feature-workflows/api";
import { type FirstRun, SUPPORT_WORKFLOW } from "./first-run.ts";
import { guideWords } from "./first-run-words.ts";

/**
 * The first run's guide card on Support reply's page (`first-run.guide-card`, first-run-flow
 * 3.2), while the first run is on in the open folder: what Acme's support workflow does, the
 * email, and **Run your first workflow**, which reads **Run again** after a run that ended without
 * a win. The button opens the page's Run form; the Pick a model screen takes its place when it is
 * built (HAL-13432). The card has no ✕: it goes at the first win or with **Skip, I'll explore**.
 */
export function firstRunGuide(firstRun: FirstRun): WorkflowGuide {
  return {
    card: (workflow) => {
      const state = firstRun.state;
      if (state.kind !== "on" || !firstRun.isOnHere || workflow.id !== SUPPORT_WORKFLOW) {
        return undefined;
      }
      return guideCard(state.ended === true);
    },
    subscribe: (listener) => firstRun.subscribe(listener),
  };
}

function guideCard(ended: boolean): WorkflowGuideCard {
  return {
    title: guideWords.title,
    lines: [{ text: guideWords.about }, { label: guideWords.emailLabel, text: guideWords.email }],
    action: {
      label: ended ? guideWords.runAgain : guideWords.run,
      run: (page) => page.openRunForm(),
    },
  };
}
