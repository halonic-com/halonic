import type {
  InboxAnswer,
  InboxItem,
  InboxItemOption,
  InboxItemState,
  MessagingId,
} from "@halonicjs/ports";
import { approvalRisk } from "./approval-risk.ts";
import { asList, asRecord, asRecords, field, type JsonRecord, text } from "./json.ts";
import { authorOf, type MapContext, timeOf } from "./map.ts";
import type { PaperclipRequestName } from "./requests.ts";

/** The request that answers a card or an approval, and its body. */
export interface AnswerRequest {
  name: PaperclipRequestName;
  body: Readonly<Record<string, unknown>>;
}

/** Card states that are an answer; cancelled, expired and failed cards aren't shown. */
const answeredStates: ReadonlySet<string> = new Set(["accepted", "rejected", "answered"]);

/** The one question of an `ask_user_questions` card, when it has exactly one. */
function onlyQuestion(payload: JsonRecord | undefined): JsonRecord | undefined {
  const questions = asRecords(field(payload, "questions"));
  return questions.length === 1 ? questions[0] : undefined;
}

function questionOf(kind: string, payload: JsonRecord | undefined): string {
  if (kind === "ask_user_questions") {
    const prompts = asRecords(field(payload, "questions")).flatMap(
      (question) => text(question, "prompt") ?? [],
    );
    return prompts.join("\n\n");
  }
  const prompt = text(payload, "prompt") ?? "";
  const details = text(payload, "detailsMarkdown");
  return details === undefined ? prompt : `${prompt}\n\n${details}`;
}

function optionsOf(kind: string, payload: JsonRecord | undefined): InboxItemOption[] {
  if (kind === "request_confirmation") {
    return [
      { id: "accept", label: text(payload, "acceptLabel") ?? "Accept" },
      { id: "reject", label: text(payload, "rejectLabel") ?? "Reject" },
    ];
  }
  if (kind === "ask_user_questions") {
    return asRecords(field(onlyQuestion(payload), "options")).flatMap((option) => {
      const id = text(option, "id");
      const label = text(option, "label");
      return id === undefined || label === undefined ? [] : [{ id, label }];
    });
  }
  // Task suggestions, checklists and verdicts are answered in Paperclip; Inbox shows them.
  return [];
}

/** What the person answered, from a resolved card's status and result. */
function answerOf(status: string, result: JsonRecord | undefined): InboxAnswer {
  if (status === "accepted" || status === "rejected") {
    const note = text(result, "reason");
    const option = status === "accepted" ? "accept" : "reject";
    return note === undefined ? { kind: "option", option } : { kind: "option", option, note };
  }
  const first = asRecords(field(result, "answers"))[0];
  const option = asList(field(first, "optionIds"))[0];
  if (typeof option === "string") {
    return { kind: "option", option };
  }
  return { kind: "reply", text: text(first, "otherText") ?? text(result, "summaryMarkdown") ?? "" };
}

/** A resolved card's or approval's state, from who resolved it and when. */
export function answeredState(
  context: MapContext,
  record: JsonRecord,
  answer: InboxAnswer,
): InboxItemState {
  return {
    kind: "answered",
    by: authorOf(
      context,
      text(record, "resolvedByAgentId"),
      text(record, "resolvedByUserId") ?? text(record, "decidedByUserId"),
    ),
    answer,
    answeredAt: text(record, "resolvedAt") ?? timeOf(record, "decidedAt"),
  };
}

/**
 * A card on task `task` as an inbox item, or `undefined` when it isn't the
 * person's to answer: addressed to an agent, or cancelled, expired or failed.
 */
export function cardToItem(
  context: MapContext,
  task: string,
  record: JsonRecord,
): InboxItem | undefined {
  const id = text(record, "id");
  const kind = text(record, "kind") ?? "";
  const status = text(record, "status") ?? "";
  if (id === undefined || text(record, "addresseeAgentId") !== undefined) {
    return undefined;
  }
  if (status !== "pending" && !answeredStates.has(status)) {
    return undefined;
  }
  const payload = asRecord(field(record, "payload"));
  return {
    id: context.ids.make("card", task, id),
    source: context.ids.source(),
    from: authorOf(context, text(record, "createdByAgentId"), text(record, "createdByUserId")),
    question: questionOf(kind, payload),
    options: optionsOf(kind, payload),
    work: context.ids.make("task", task),
    // A card asks a question in words; answering it spends nothing and changes no one's rights.
    risk: "normal",
    createdAt: timeOf(record, "createdAt"),
    // The provider lists no files yet; it reads none, so it makes no request for them.
    attachments: [],
    state:
      status === "pending"
        ? { kind: "open" }
        : answeredState(context, record, answerOf(status, asRecord(field(record, "result")))),
  };
}

/**
 * The request that gives `answer` to card `record`, or `undefined` when the
 * card can't take that answer here: a written reply to a confirmation, an
 * option the card doesn't offer, an `action-result`, an `answers` answer (no
 * Paperclip item carries `questions` yet), or a kind answered only in Paperclip.
 */
export function cardAnswerRequest(
  record: JsonRecord,
  answer: InboxAnswer,
): AnswerRequest | undefined {
  if (!isOptionOrReply(answer)) {
    return undefined;
  }
  const kind = text(record, "kind");
  const payload = asRecord(field(record, "payload"));
  if (kind === "request_confirmation" && answer.kind === "option") {
    if (answer.option === "accept") {
      return { name: "acceptCard", body: {} };
    }
    return answer.option === "reject"
      ? { name: "rejectCard", body: answer.note === undefined ? {} : { reason: answer.note } }
      : undefined;
  }
  const question = kind === "ask_user_questions" ? onlyQuestion(payload) : undefined;
  const questionId = text(question, "id");
  if (questionId === undefined) {
    return undefined;
  }
  if (answer.kind === "reply") {
    return {
      name: "respondToCard",
      body: { answers: [{ questionId, optionIds: [], otherText: answer.text }] },
    };
  }
  const offered = optionsOf("ask_user_questions", payload).some(
    (option) => option.id === answer.option,
  );
  if (!offered) {
    return undefined;
  }
  const otherText = answer.note === undefined ? {} : { otherText: answer.note };
  return {
    name: "respondToCard",
    body: { answers: [{ questionId, optionIds: [answer.option], ...otherText }] },
  };
}

/** Whether an answer is an option or a reply, the only kinds a Paperclip card takes here. */
function isOptionOrReply(
  answer: InboxAnswer,
): answer is Extract<InboxAnswer, { kind: "option" | "reply" }> {
  return answer.kind === "option" || answer.kind === "reply";
}

const approvalOptions: readonly InboxItemOption[] = [
  { id: "approve", label: "Approve" },
  { id: "reject", label: "Reject" },
];

/** A Paperclip approval as an inbox item; `work` is the first task it is linked to. */
export function approvalToItem(
  context: MapContext,
  record: JsonRecord,
  work: MessagingId | undefined,
): InboxItem | undefined {
  const id = text(record, "id");
  if (id === undefined) {
    return undefined;
  }
  const payload = asRecord(field(record, "payload"));
  // The type comes from Paperclip and says what approving does (hire an agent, change a budget).
  // The title and summary come from the agent that asks, so they never stand in for the type.
  const type = text(record, "type");
  const kind = `Approval: ${type ?? "request"}`;
  const agentTitle = text(payload, "title");
  const title = agentTitle === undefined ? kind : `${kind}\n\n${agentTitle}`;
  const summary = text(payload, "summary");
  const status = text(record, "status");
  const decided = status === "approved" || status === "rejected";
  return {
    id: context.ids.make("approval", id),
    source: context.ids.source(),
    from: authorOf(context, text(record, "requestedByAgentId"), text(record, "requestedByUserId")),
    question: summary === undefined ? title : `${title}\n\n${summary}`,
    options: approvalOptions,
    ...(work === undefined ? {} : { work }),
    risk: approvalRisk(type),
    createdAt: timeOf(record, "createdAt"),
    // The provider lists no files yet; it reads none, so it makes no request for them.
    attachments: [],
    state: decided
      ? answeredState(context, record, {
          kind: "option",
          option: status === "approved" ? "approve" : "reject",
        })
      : { kind: "open" },
  };
}

/** The request that gives `answer` to an approval, or `undefined` for a reply or an unknown option. */
export function approvalAnswerRequest(answer: InboxAnswer): AnswerRequest | undefined {
  if (answer.kind !== "option") {
    return undefined;
  }
  const body = answer.note === undefined ? {} : { decisionNote: answer.note };
  if (answer.option === "approve") {
    return { name: "approve", body };
  }
  return answer.option === "reject" ? { name: "rejectApproval", body } : undefined;
}
