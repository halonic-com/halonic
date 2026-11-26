import type {
  InboxAnswer,
  InboxClosedReason,
  InboxItem,
  InboxItemOption,
  InboxItemState,
} from "@halonicjs/ports";
import type { AnswerRequest } from "./cards.ts";
import { answeredState, closedState } from "./cards.ts";
import { asRecords, field, type JsonRecord, text } from "./json.ts";
import { authorOf, fullLinksOf, type MapContext, timeOf } from "./map.ts";

// Paperclip's standalone decisions (`paperclip-client.decisions`): an agent offers the board
// up to 8 options, each with effects on tasks that Paperclip runs once one is picked.

/** Paperclip's largest page of decisions; more than 100 open ones lose the rest from the Inbox. */
export const decisionPage = "100";

/** A decision's options as buttons, in Paperclip's order. */
function optionsOf(record: JsonRecord): InboxItemOption[] {
  return asRecords(field(record, "options")).flatMap((option) => {
    const id = text(option, "id");
    const label = text(option, "label");
    return id === undefined || label === undefined ? [] : [{ id, label }];
  });
}

/** Whether a decision asks for a written value Halonic has no field for, so it is answered in Paperclip. */
function needsInput(record: JsonRecord): boolean {
  return asRecords(field(record, "inputs")).some((input) => field(input, "required") === true);
}

/** Decision states that ended without a pick (`paperclip-client.closed-items`). */
const closedDecisions: ReadonlyMap<string, InboxClosedReason> = new Map([
  ["expired", "expired"],
  ["cancelled", "cancelled"],
]);

/**
 * A decision as an inbox item, or `undefined` for a status Halonic doesn't know. One that expired
 * or was cancelled is `closed`. `work` is the task the agent asked from.
 */
export function decisionToItem(context: MapContext, record: JsonRecord): InboxItem | undefined {
  const id = text(record, "id");
  const status = text(record, "status") ?? "";
  if (
    id === undefined ||
    (status !== "open" && status !== "decided" && !closedDecisions.has(status))
  ) {
    return undefined;
  }
  const task = text(record, "originIssueId");
  const body = text(record, "body");
  const title = text(record, "title") ?? "";
  const chosen = text(record, "chosenOptionId");
  const options = optionsOf(record);
  // A destructive option, such as cancelling a task tree, waits for the desktop like a risky approval.
  const destructive = asRecords(field(record, "options")).some(
    (option) => text(option, "style") === "destructive",
  );
  return {
    id: context.ids.make("decision", id),
    source: context.ids.source(),
    from: authorOf(context, text(record, "originAgentId"), undefined),
    question: fullLinksOf(context, body === undefined ? title : `${title}\n\n${body}`),
    options,
    kind: "question",
    ...(task === undefined ? {} : { work: context.ids.make("task", task) }),
    risk: destructive ? "risky" : "normal",
    createdAt: timeOf(record, "createdAt"),
    // The provider lists no files yet; it reads none, so it makes no request for them.
    attachments: [],
    state: decisionState(context, record, status, chosen),
  };
}

/** A decision's state: answered with the option picked, closed, or else open. */
function decisionState(
  context: MapContext,
  record: JsonRecord,
  status: string,
  chosen: string | undefined,
): InboxItemState {
  if (status === "decided" && chosen !== undefined) {
    return answeredState(context, record, { kind: "option", option: chosen });
  }
  const closed = closedDecisions.get(status);
  return closed === undefined ? { kind: "open" } : closedState(context, record, closed);
}

/**
 * The request that picks `answer`'s option on decision `record`, or `undefined` when the
 * decision can't take it here: not an option it offers, or a decision that needs a written value.
 * The idempotency key makes a repeated pick of the same option one decision, not two.
 */
export function decisionAnswerRequest(
  decision: string,
  record: JsonRecord,
  answer: InboxAnswer,
): AnswerRequest | undefined {
  if (answer.kind !== "option" || needsInput(record)) {
    return undefined;
  }
  const offered = optionsOf(record).some((option) => option.id === answer.option);
  if (!offered) {
    return undefined;
  }
  return {
    name: "decide",
    body: { optionId: answer.option, idempotencyKey: `halonic:${decision}:${answer.option}` },
  };
}
