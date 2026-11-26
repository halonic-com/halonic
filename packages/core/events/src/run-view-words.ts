import type { RunViewFailure } from "./run-view.ts";

/**
 * The fixed sentences of the run view (design 16.4, H11): one per failure cause, and the
 * lines for an approval whose seller wrote no approval text and a question without a title. They name no tool, model or
 * error text. `{limit}` is the plan's stop code and `{connection}` the connection's name.
 */
export const runViewWords = {
  stopped: "This run was stopped.",
  limit: "This run stopped at a limit of your plan ({limit}).",
  connection: "This run stopped because the connection {connection} refused it.",
  unavailable: "This run stopped because a service didn't answer. Try again later.",
  other: "This run didn't finish.",
  approval: "Approve this step?",
  question: "This run is waiting for your answer.",
} as const;

/** The fixed sentence for a run view's failure. */
export function runViewFailureSentence(failure: RunViewFailure): string {
  switch (failure.cause) {
    case "limit":
      return runViewWords.limit.replace("{limit}", failure.limit);
    case "connection":
      return runViewWords.connection.replace("{connection}", failure.connection);
    default:
      return runViewWords[failure.cause];
  }
}
