import type { AnswerResult, InboxAnswer } from "@halonicjs/ports";
import { dollars } from "./approval-text.ts";
import { approvalWords } from "./approval-words.ts";
import { newLimitCents } from "./budget-amount.ts";
import type { AnswerRequest } from "./cards.ts";
import { asRecord, asRecords, field, type JsonRecord, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";
import { type PaperclipAnswer, PaperclipClientError } from "./transport.ts";

// Answering a budget override (`paperclip-client.budget-incidents`, HAL-18921). Paperclip's
// approve route only records the answer for `budget_override_required`; the limit is raised and
// the paused work resumed only by resolving the approval's budget incident. Paperclip has no
// route that reads one incident, so it is found among the budget overview's active incidents
// by the approval it belongs to.

/** Who answers: the reader to send with, the company the incident is in, and the clock. */
export interface BudgetAnswerer {
  reader: PaperclipReader;
  company: string;
  now: () => Date;
}

/**
 * Why a budget override wasn't answered, said to the person: its `denied` kind makes the Inbox
 * card show this sentence instead of only "Couldn't record your decision."
 */
export class BudgetAnswerError extends PaperclipClientError {
  readonly kind = "denied";

  constructor(message: string) {
    super(message, "refused");
    this.name = "BudgetAnswerError";
  }
}

/** The answer of a write that went through, or of one Paperclip refused for a reason the port has. */
type Outcome = AnswerResult | undefined;

/**
 * Gives Approve or Reject to budget override `approval`: Approve raises the limit to the amount
 * in the answer's note and resumes the paused work, Reject keeps it paused. Throws, sending
 * nothing, when the amount can't be read or isn't above what was already spent, and when
 * Paperclip has no budget stop open for the approval.
 */
export async function answerBudgetOverride(
  answerer: BudgetAnswerer,
  approval: string,
  answer: Extract<InboxAnswer, { kind: "option" }>,
): Promise<AnswerResult> {
  const { reader, company } = answerer;
  const overview = await reader.send("budgetsOverview", { path: { company } });
  const unread = refusalResult(overview);
  if (unread !== undefined || overview.kind !== "ok") {
    return unread ?? refusedBy(overview);
  }
  const incident = asRecords(field(asRecord(overview.body), "activeIncidents")).find(
    (candidate) => text(candidate, "approvalId") === approval,
  );
  if (incident === undefined) {
    throw new BudgetAnswerError(approvalWords.noBudgetStop);
  }
  const request = resolveRequest(incident, answer);
  const sent = await reader.send(request.name, {
    path: { company, incident: text(incident, "id") ?? "" },
    body: request.body,
  });
  if (sent.kind === "ok") {
    const resolvedAt = text(asRecord(sent.body), "resolvedAt");
    return { outcome: "answered", answeredAt: resolvedAt ?? answerer.now().toISOString() };
  }
  return refusalResult(sent) ?? refusedBy(sent);
}

/** The resolve request for `answer`: raise to the written limit for Approve, keep paused for Reject. */
function resolveRequest(
  incident: JsonRecord,
  answer: Extract<InboxAnswer, { kind: "option" }>,
): AnswerRequest {
  if (answer.option === "reject") {
    return { name: "keepBudgetPaused", body: { action: "keep_paused" } };
  }
  const amount = newLimitCents(answer.note);
  if (amount === undefined) {
    throw new BudgetAnswerError(approvalWords.newLimitUnreadable);
  }
  // Paperclip refuses a limit that isn't above the spend; saying so here names the spend.
  const spent = field(incident, "amountObserved");
  if (typeof spent === "number" && amount <= spent) {
    throw new BudgetAnswerError(approvalWords.newLimitTooLow(dollars(spent) ?? ""));
  }
  return { name: "raiseBudget", body: { action: "raise_budget_and_resume", amount } };
}

/** The port's refusal for an answer that is offline, signed out or gone; nothing for any other. */
function refusalResult(answer: PaperclipAnswer): Outcome {
  if (answer.kind === "ok") {
    return undefined;
  }
  const { failure } = answer;
  return failure === "offline" || failure === "signed-out" || failure === "not-found"
    ? { outcome: "refused", reason: failure }
    : undefined;
}

/** Thrown for any other failure, with Paperclip's own reason when it gave one. */
function refusedBy(answer: PaperclipAnswer): never {
  const detail = answer.kind === "failed" ? answer.detail : undefined;
  throw new BudgetAnswerError(approvalWords.budgetRefused(detail));
}
