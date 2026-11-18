import { type EngineWords, errorMessageFor } from "@halonicjs/studio-shell";
import { BudgetUsedUp } from "./inbox-requests.ts";

/**
 * The line under the request form when a request didn't start (microcopy 10.3): "Not started:
 * *reason*." The reason is the failure's own sentence, kept as written: it may start with a name
 * such as "Gmail" or "OpenAI". A failure
 * with no kind of its own says the engine isn't answering, since it never reached the engine.
 */
export function notStartedLine(error: unknown, words: EngineWords): string {
  if (error instanceof BudgetUsedUp) {
    return `Not started: ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`;
  }
  const message = errorMessageFor(error, { title: "Not started" });
  const reason = message.kind === "internal" ? words.notAnswering : message.body;
  return `Not started: ${reason.trim().replace(/[.!?]+$/, "")}.`;
}
