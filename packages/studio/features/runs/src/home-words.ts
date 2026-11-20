// Words for the Runs feature on Home and in Ctrl K (mc 3.3, 3.4, HAL-8553):
// the Recent runs card, the Spend tile and the run search rows.

import { moneyAmount } from "@halonicjs/app";

/** Home's Recent runs card (mc 3.3, 3.4). */
export const homeWords = {
  label: "Recent runs",
  /**
   * A row's title: what ran and which run, "Support reply · run 891b5a", so two runs of one
   * workflow read apart, on screen and to a screen reader (HAL-12461, a11y check H2).
   */
  rowTitle: (workflow: string, shortId: string) => `${workflow} · run ${shortId}`,
  empty: "No runs yet. When an agent or workflow runs, you'll see it here.",
  seeAll: "See all runs",
  /**
   * Under the empty line, so Home never ends on nothing (empty-home-checklist 1, scope b). Where a
   * workflow's page has **Run**, the rest says to press it (HAL-12371).
   */
  about: "Studio shows what your agents are doing and lets you read each run. ",
  /** The rest of the note without **Run**, as in a served Studio; `halonic run` is shown as code. */
  startNote: ["To start one, use the command line: ", "halonic run", "."],
  /** The empty line in the Acme sample, where a run starts from the Inbox, not the command line. */
  sampleEmpty: "No runs yet. Start one from the Inbox, and it shows up here.",
  /** The note without **Run** when the workspace has no workflow yet (HAL-10128). */
  noWorkflowNote:
    "This workspace has no workflows yet. Add one in Workflows, then start it from the command line.",
  /** The same on a Windows folder, where there is no command to start it (D-A2, HAL-12847). */
  noWorkflowNoCommandNote: "This workspace has no workflows yet. Add one in Workflows.",
};

/** Home's Spend tile (HAL-8553): the tile's title, the line under the number, and its empty text. */
export const spendWords = {
  title: "Estimated spend per month",
  empty: "No spend yet. When a run costs something, you'll see it here by month.",
  budgetLabel: "Budget",
  /** An amount in the money rule (mc 15.2): "€120.40"; under half a cent, "under €0.01", never "€0.00". */
  amount: (amount: number, currency: string) =>
    amount > 0 && amount < 0.005
      ? `under ${moneyAmount(0.01, currency)}`
      : moneyAmount(amount, currency),
  thisMonth: "This month, estimated",
  withinBudget: (budget: string) => `This month, estimated, within the ${budget} budget`,
  overBudget: (budget: string) => `This month, estimated, over the ${budget} budget`,
};

/** Ctrl K's run rows (checklist part 1, 1.1). */
export const searchWords = {
  title: "Runs",
  /** The hit's label: the run's short id, then what ran. */
  label: (shortId: string, workflow: string) => `Run ${shortId} · ${workflow}`,
  /** The hit's detail: its kind and hub, as other items show theirs. */
  detail: (hub: string) => `Run · ${hub}`,
};
