/**
 * The words for the phone's prompt box and for what became of an answer or a prompt (`s-m3` on
 * HAL-12206, decision 6; D7 design on HAL-15159, section 2). The stale reason is the strings
 * table's `phone.stale.promptReason`; the outcome lines are Sofia's (HAL-16054; strings table
 * gap G29, microcopy 28). Nothing is ever sent twice, so no line offers to send it again by itself.
 */

import type { RemoteSendOutcome } from "./remote-view.ts";
import { ANSWER_RISKY_ON_COMPUTER } from "./view-of.ts";

export const promptWords = {
  /** The box's name for a screen reader (strings table, accessibility). */
  label: "Prompt",
  placeholder: (agent: string) => `Message ${agent}…`,
  send: "Send",
  /** In the box, and the reason Send is off, while the view is stale (`phone.stale.promptReason`). */
  staleReason: "Reconnect to send a prompt.",
  /** `gatewayMaxPromptLength`, written out; `send-words.test.ts` keeps the two in step. */
  tooLong: "A prompt can be at most 10,000 characters.",
  /** Said politely once the host took it; the box empties. */
  sent: "Prompt sent.",
} as const;

const goneAgent = "This agent isn't on your computer any more.";
const notConnected = "Not sent. Try again once your phone reconnects.";

/**
 * The line under Approve and Deny, or under the prompt box, after `outcome`; `undefined` when
 * there's nothing to add: it was done (the approval settles, or the box says {@link
 * promptWords.sent}), or it was off and the reason already shows.
 */
export function sendOutcomeLine(
  what: "answer" | "prompt",
  outcome: RemoteSendOutcome,
): string | undefined {
  if (outcome.kind === "done") return undefined;
  if (outcome.kind === "not-sent" && outcome.reason === "off") return undefined;
  if (outcome.kind === "not-sent" && outcome.reason === "not-open") return notConnected;
  if (outcome.kind === "refused" && outcome.code === "unknown-session") return goneAgent;
  return what === "answer" ? answerLine(outcome) : promptLine(outcome);
}

function answerLine(outcome: Exclude<RemoteSendOutcome, { kind: "done" }>): string {
  if (outcome.kind === "cut-off") {
    return "The connection dropped before your computer confirmed your answer. Once your phone reconnects, you'll see whether it arrived.";
  }
  if (outcome.kind === "refused" && outcome.code === "unknown-approval") {
    return "This was already answered, or the agent stopped asking.";
  }
  return ANSWER_RISKY_ON_COMPUTER;
}

function promptLine(outcome: Exclude<RemoteSendOutcome, { kind: "done" }>): string {
  if (outcome.kind === "cut-off") {
    return "The connection dropped before your computer confirmed this prompt, so it may not have arrived. Check the agent before you send it again.";
  }
  if (outcome.kind === "refused") {
    return "Your computer didn't accept this prompt. Send it from your computer instead.";
  }
  if (outcome.reason === "not-allowed") {
    return "Your phone can't send this. Send it from your computer.";
  }
  return promptWords.tooLong;
}
