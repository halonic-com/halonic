import type { TriggerOwner } from "../api.ts";

/** The Triggers section's words (flow-routines 2.3). */
export const triggersWords = {
  heading: "Triggers",
  loading: "Loading triggers",
  loadFailedTitle: "Couldn't load triggers",
  tryAgain: "Try again",
  addTrigger: "Add trigger",
  off: "Off",
  /** Said when nothing starts the owner on its own. */
  empty: (kind: TriggerOwner["kind"]) =>
    kind === "workflow"
      ? "Nothing starts this workflow on its own yet; it runs when called or with Run."
      : "Nothing starts this agent on its own yet; it runs when called.",
  /** The second line of a row that is on: its name and when it starts next. */
  nameAndNext: (name: string, next: string | undefined) =>
    next === undefined ? name : `${name} · ${next}`,
  addFailed: (reason: string) => `Couldn't add a trigger. ${reason}`,
} as const;
