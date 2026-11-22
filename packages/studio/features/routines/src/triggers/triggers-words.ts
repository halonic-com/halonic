import { agentCantRunWords, type TriggerOwner } from "../api.ts";

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
  /** Said when nothing starts the owner on its own. */
  empty: (kind: TriggerOwner["kind"]) =>
    kind === "workflow"
      ? "Nothing starts this workflow on its own yet; it runs when called or with Run."
      : "No trigger starts this agent.",
  /**
   * Said on an agent before Add trigger asks for its prompt, since a routine that starts an agent
   * can't run it yet (HAL-15334).
   */
  agentCantRun: `${agentCantRunWords.why} Add a trigger to a workflow that uses this agent instead.`,
  /** The second line of a row that is on: its name and when it starts next. */
  nameAndNext: (name: string, next: string | undefined) =>
    next === undefined ? name : `${name} · ${next}`,
  addFailed: (reason: string) => `Couldn't add a trigger. ${reason}`,
} as const;
