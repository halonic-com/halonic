import type {
  InboxAnswer,
  InboxItem,
  InboxItemOption,
  InboxItemState,
  InboxQuestion,
  MessagingId,
} from "@halonicjs/ports";
import { approvalRisk } from "./approval-risk.ts";
import { approvalQuestion, asksToRunTool, confirmationQuestion } from "./approval-text.ts";
import { approvalWords } from "./approval-words.ts";
import {
  listCardAnswerOf,
  listCardAnswerRequest,
  listCardKinds,
  listCardQuestions,
} from "./card-kinds.ts";
import {
  cardQuestions,
  questionOptions,
  questionsAnswerBody,
  questionsAnswerOf,
} from "./card-questions.ts";
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

function questionOf(kind: string, record: JsonRecord, payload: JsonRecord | undefined): string {
  if (kind === "suggest_tasks") {
    const title = text(record, "title") ?? "";
    const summary = text(record, "summary");
    return summary === undefined ? title : `${title}\n\n${summary}`;
  }
  if (kind === "ask_user_questions") {
    const prompts = asRecords(field(payload, "questions")).flatMap(
      (question) => text(question, "prompt") ?? [],
    );
    return prompts.join("\n\n");
  }
  return confirmationQuestion(payload);
}

function optionsOf(kind: string, payload: JsonRecord | undefined): InboxItemOption[] {
  if (kind === "request_confirmation") {
    return [
      { id: "accept", label: text(payload, "acceptLabel") ?? "Accept" },
      { id: "reject", label: text(payload, "rejectLabel") ?? "Reject", ...rejectNote(payload) },
    ];
  }
  if (kind === "ask_user_questions") {
    return questionOptions(onlyQuestion(payload));
  }
  // Checkbox, verdict and task cards ask `questions` instead (`card-kinds.ts`).
  return [];
}

/** The reason field a confirmation's Reject needs when Paperclip refuses a reject without one. */
function rejectNote(
  payload: JsonRecord | undefined,
): Pick<InboxItemOption, "noteRequired" | "noteLabel"> {
  if (field(payload, "rejectRequiresReason") !== true) {
    return {};
  }
  return {
    noteRequired: true,
    noteLabel: text(payload, "rejectReasonLabel") ?? approvalWords.rejectReason,
  };
}

/**
 * What the person answered, from a resolved card's status and result. A card
 * that asks `questions` reads back as an `answers` answer with every question's options.
 */
function answerOf(
  kind: string,
  status: string,
  result: JsonRecord | undefined,
  asksQuestions: boolean,
): InboxAnswer {
  if (listCardKinds.has(kind)) {
    return listCardAnswerOf(kind, status, result);
  }
  if (asksQuestions) {
    return questionsAnswerOf(result);
  }
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
  const result = asRecord(field(record, "result"));
  const questions = questionsOf(kind, record, payload, result);
  return {
    id: context.ids.make("card", task, id),
    source: context.ids.source(),
    from: authorOf(context, text(record, "createdByAgentId"), text(record, "createdByUserId")),
    question: questionOf(kind, record, payload),
    options: questions === undefined ? optionsOf(kind, payload) : [],
    ...(questions === undefined ? {} : { questions }),
    work: context.ids.make("task", task),
    // A card asks a question in words and changes no one's rights, unless it lets an agent run a tool.
    risk: asksToRunTool(payload) ? "risky" : "normal",
    createdAt: timeOf(record, "createdAt"),
    // The provider lists no files yet; it reads none, so it makes no request for them.
    attachments: [],
    state:
      status === "pending"
        ? { kind: "open" }
        : answeredState(context, record, answerOf(kind, status, result, questions !== undefined)),
  };
}

/** A card's `questions`: a question card's when it asks several, a checkbox, verdict or task card's always. */
function questionsOf(
  kind: string,
  record: JsonRecord,
  payload: JsonRecord | undefined,
  result: JsonRecord | undefined,
): InboxQuestion[] | undefined {
  if (listCardKinds.has(kind)) {
    const prompt = text(payload, "prompt") ?? text(record, "title") ?? "";
    // An answered card keeps every item, so its record can name each verdict by its item.
    const partial = text(record, "status") === "pending" ? result : undefined;
    return listCardQuestions(kind, payload, partial, prompt);
  }
  return kind === "ask_user_questions" ? cardQuestions(payload) : undefined;
}

/**
 * The request that gives `answer` to card `record`, or `undefined` when the
 * card can't take that answer here: a written reply to a confirmation, an
 * option the card doesn't offer, an `action-result`, an `answers` answer to a
 * card without `questions` (or an option or reply to one with them, or answers
 * that don't fit them), a checkbox, verdict or task answer that doesn't fit
 * (`card-kinds.ts`), or a kind answered only in Paperclip.
 */
export function cardAnswerRequest(
  record: JsonRecord,
  answer: InboxAnswer,
): AnswerRequest | undefined {
  const kind = text(record, "kind") ?? "";
  const payload = asRecord(field(record, "payload"));
  if (listCardKinds.has(kind)) {
    return listCardAnswerRequest(kind, payload, asRecord(field(record, "result")), answer);
  }
  const questions = kind === "ask_user_questions" ? cardQuestions(payload) : undefined;
  if (questions !== undefined || answer.kind === "answers") {
    const body =
      questions !== undefined && answer.kind === "answers"
        ? questionsAnswerBody(questions, answer)
        : undefined;
    return body === undefined ? undefined : { name: "respondToCard", body };
  }
  if (answer.kind === "action-result") {
    return undefined;
  }
  if (kind === "request_confirmation") {
    return answer.kind === "option" ? confirmationRequest(payload, answer) : undefined;
  }
  return kind === "ask_user_questions" ? oneQuestionRequest(payload, answer) : undefined;
}

/** The request that accepts or rejects a confirmation card, or `undefined` for another option. */
function confirmationRequest(
  payload: JsonRecord | undefined,
  answer: Extract<InboxAnswer, { kind: "option" }>,
): AnswerRequest | undefined {
  if (answer.option === "accept") {
    return { name: "acceptCard", body: {} };
  }
  if (answer.option !== "reject") {
    return undefined;
  }
  if (answer.note !== undefined) {
    return { name: "rejectCard", body: { reason: answer.note } };
  }
  // Paperclip refuses a reject without a reason when the card asks for one.
  return field(payload, "rejectRequiresReason") === true
    ? undefined
    : { name: "rejectCard", body: {} };
}

/** The request that answers a card's one single-select question with an option it offers or a reply. */
function oneQuestionRequest(
  payload: JsonRecord | undefined,
  answer: Extract<InboxAnswer, { kind: "option" | "reply" }>,
): AnswerRequest | undefined {
  const questionId = text(onlyQuestion(payload), "id");
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

const approvalOptions: readonly InboxItemOption[] = [
  { id: "approve", label: approvalWords.approve },
  { id: "reject", label: approvalWords.reject },
  {
    id: "request-changes",
    label: approvalWords.requestChanges,
    // Request changes tells the agent what to change, so it is sent only with a note.
    noteRequired: true,
    noteLabel: approvalWords.whatShouldChange,
  },
];

/** How a decided approval was answered; a `revision_requested` one waits on the agent that asked. */
const decidedOptions: ReadonlyMap<string, string> = new Map([
  ["approved", "approve"],
  ["rejected", "reject"],
  ["revision_requested", "request-changes"],
]);

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
  // The type comes from Paperclip and says what approving does (hire an agent, change a budget).
  // The title and summary come from the agent that asks, so they never stand in for the type.
  const type = text(record, "type");
  const decided = decidedOptions.get(text(record, "status") ?? "");
  const note = text(record, "decisionNote");
  return {
    id: context.ids.make("approval", id),
    source: context.ids.source(),
    from: authorOf(context, text(record, "requestedByAgentId"), text(record, "requestedByUserId")),
    question: approvalQuestion(type, asRecord(field(record, "payload"))),
    options: approvalOptions,
    ...(work === undefined ? {} : { work }),
    risk: approvalRisk(type),
    createdAt: timeOf(record, "createdAt"),
    // The provider lists no files yet; it reads none, so it makes no request for them.
    attachments: [],
    state:
      decided === undefined
        ? { kind: "open" }
        : answeredState(context, record, {
            kind: "option",
            option: decided,
            ...(note === undefined ? {} : { note }),
          }),
  };
}

const approvalRequests: ReadonlyMap<string, AnswerRequest["name"]> = new Map([
  ["approve", "approve"],
  ["reject", "rejectApproval"],
  ["request-changes", "requestApprovalRevision"],
]);

/** The request that gives `answer` to an approval, or `undefined` for a reply or an unknown option. */
export function approvalAnswerRequest(answer: InboxAnswer): AnswerRequest | undefined {
  if (answer.kind !== "option") {
    return undefined;
  }
  const name = approvalRequests.get(answer.option);
  const body = answer.note === undefined ? {} : { decisionNote: answer.note };
  return name === undefined ? undefined : { name, body };
}
