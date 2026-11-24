import { markHiddenName } from "@halonicjs/std";
import { type AfterAnswer, approvalSentText } from "../decide.ts";
import { decidedAt } from "./waiting-time.ts";

/**
 * An answer's label, on its button and in the decided line alike: the step's own label when it
 * has one, with hidden characters marked, else "Approve" and "Reject", else the event's name in
 * words with a capital first letter, `needs_info` as "Needs info".
 */
export function answerLabel(event: string, own?: string): string {
  if (own !== undefined && own.trim() !== "") return markHiddenName(own.trim());
  const words = event.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The step's own label for an answer, or `undefined` without one. Events come from the user's
 * workflow, so one named `constructor` must not find an `Object.prototype` member.
 */
export function ownLabel(
  labels: Readonly<Record<string, string>>,
  event: string,
): string | undefined {
  return Object.hasOwn(labels, event) ? labels[event] : undefined;
}

/**
 * An answer's busy label: "Approving…" and "Rejecting…" only beside the built-in "Approve" and
 * "Reject", else the neutral "Working…", so it never names the answer with another word.
 */
export function busyLabel(event: string, own?: string): string {
  if (answerLabel(event, own) === answerLabel(event)) {
    if (event === "approve") return "Approving…";
    if (event === "reject") return "Rejecting…";
  }
  return "Working…";
}

/**
 * What the decided line says happens next, after an approve, whatever the step calls it: "The run
 * continues." while it goes on, "The run finished." when the answer finished it, and nothing when
 * it ended another way (HAL-13919); on a `phone` "Approval sent." instead of "The run continues."
 * (HAL-17820). A reject is the step's own answer, so it says nothing about a tool call or the
 * agent, and neither does any other answer.
 */
function whatNext(event: string, after: AfterAnswer, phone: boolean): string {
  if (event !== "approve") return "";
  if (after === "continues") return phone ? ` ${approvalSentText}` : " The run continues.";
  return after === "finished" ? " The run finished." : "";
}

/**
 * The decided Callout of a wait step (mc 5). An answer the step labels itself, and any answer
 * other than approve and reject, names the button you pressed with the same word (HAL-4008),
 * followed by what happens next as the built-in line says it (HAL-4050).
 */
export function answeredText(
  event: string,
  at: Date,
  after: AfterAnswer,
  own?: string,
  phone = false,
): string {
  const time = decidedAt(at);
  const label = answerLabel(event, own);
  const next = whatNext(event, after, phone);
  if (label === answerLabel(event)) {
    if (event === "approve") return `Approved by you at ${time}.${next}`;
    if (event === "reject") return `Rejected by you at ${time}.${next}`;
  }
  return `You chose ${label} at ${time}.${next}`;
}
