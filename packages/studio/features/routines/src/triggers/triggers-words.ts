import { agentCantRunWords } from "../api.ts";

/** The Triggers section's words (flow-routines 2.3). */
export const triggersWords = {
  /** Names the Triggers page under an agent's or workflow's Configuration: its tab and tab panel. */
  heading: "Triggers",
  loading: "Loading triggers",
  loadFailedTitle: "Couldn't load triggers",
  tryAgain: "Try again",
  addTrigger: "Add trigger",
  cancel: "Cancel",
  off: "Off",
  /** Said on a workflow when nothing starts it on its own. */
  empty: "Nothing starts this workflow on its own yet; it runs when called or with Run.",
  /**
   * Said on an agent in place of Add trigger, since a routine that starts an agent can't run it yet
   * (HAL-15334, HAL-15452).
   */
  agentCantRun: agentCantRunWords.onAgent,
  /** A button under that line for each workflow the agent is a step in. */
  addTriggerTo: (workflowName: string) => `Add trigger to ${workflowName}`,
  newWorkflow: "New workflow",
  /** The second line of a row that is on: its name and when it starts next. */
  nameAndNext: (name: string, next: string | undefined) =>
    next === undefined ? name : `${name} · ${next}`,
  addFailed: (reason: string) => `Couldn't add a trigger. ${reason}`,
} as const;
