// Paperclip's checkbox, item-verdict and suggested-task cards on the `questions`
// shape (requirement `paperclip-client.card-kinds`). Each maps back to its own
// Paperclip request: no new port types (Liam, HAL-18861).
import {
  type InboxAnswer,
  type InboxItemOption,
  type InboxQuestion,
  type InboxQuestionsAnswer,
  inboxQuestionOptionsMax,
  inboxQuestionsMax,
  questionsAnswerFits,
} from "@halonicjs/ports";
import { approvalWords } from "./approval-words.ts";
import { asList, asRecords, field, type JsonRecord, text } from "./json.ts";
import type { PaperclipRequestName } from "./requests.ts";

/** The card kinds this module maps; every other kind is someone else's. */
export const listCardKinds: ReadonlySet<string> = new Set([
  "request_checkbox_confirmation",
  "request_item_verdicts",
  "suggest_tasks",
]);

/** The one question of a checkbox card and of a task-suggestion card. */
const checkboxQuestion = "options";
const tasksQuestion = "tasks";

/** Paperclip's own words for each verdict, as its card shows them. */
const verdictLabels: Readonly<Record<string, string>> = {
  approve: "Approve",
  reject: "Reject",
  defer: "Defer",
};

/** A request and its body, as `cards.ts` sends it. */
interface KindRequest {
  name: PaperclipRequestName;
  body: Readonly<Record<string, unknown>>;
}

function strings(value: unknown): string[] {
  return asList(value).filter((each): each is string => typeof each === "string");
}

function labelled(records: readonly JsonRecord[], idField: string, labelField: string) {
  return records.slice(0, inboxQuestionOptionsMax).flatMap((record): InboxItemOption[] => {
    const id = text(record, idField);
    const label = text(record, labelField);
    return id === undefined || label === undefined ? [] : [{ id, label }];
  });
}

/** The verdicts a card offers: its own list, else Paperclip's default, approve and reject. */
function verdictsOf(payload: JsonRecord | undefined): string[] {
  const listed = strings(field(payload, "verdicts")).filter((each) => each in verdictLabels);
  return listed.length > 0 ? listed : ["approve", "reject"];
}

/** The verdicts that need a reason: the card's list, else Paperclip's default, reject. */
function reasonVerdicts(payload: JsonRecord | undefined): string[] {
  const listed = field(payload, "requireReasonOn");
  return listed === undefined ? ["reject"] : strings(listed);
}

/** The items a verdict card still waits on: an item a partial submit resolved is left out. */
function openVerdictItems(payload: JsonRecord | undefined, result: JsonRecord | undefined) {
  const resolved = new Set(asRecords(field(result, "items")).map((item) => text(item, "id")));
  return asRecords(field(payload, "items")).filter((item) => !resolved.has(text(item, "id")));
}

/**
 * The questions of a checkbox, verdict or task-suggestion card: one `multiple`
 * question for a checkbox or task card, one optional `single` question per
 * item still open for a verdict card, so a partial answer fits. `prompt` is
 * the card's own: its `prompt`, or a task card's title.
 */
export function listCardQuestions(
  kind: string,
  payload: JsonRecord | undefined,
  result: JsonRecord | undefined,
  prompt: string,
): InboxQuestion[] {
  if (kind === "request_item_verdicts") {
    const needReason = reasonVerdicts(payload);
    const verdicts = verdictsOf(payload).map((id): InboxItemOption => {
      const label = verdictLabels[id] ?? id;
      // A verdict that needs a reason asks for it as a Reject button's note does (HAL-20649);
      // any other one has no words of ours, so apps label its field with the verdict.
      if (!needReason.includes(id)) return { id, label };
      return id === "reject"
        ? { id, label, noteRequired: true, noteLabel: approvalWords.rejectReason }
        : { id, label, noteRequired: true };
    });
    const items = openVerdictItems(payload, result).slice(0, inboxQuestionsMax);
    return labelled(items, "id", "label").map((item) => ({
      id: item.id,
      prompt: item.label,
      selection: "single",
      options: verdicts,
      required: false,
    }));
  }
  if (kind === "suggest_tasks") {
    const tasks = labelled(asRecords(field(payload, "tasks")), "clientKey", "title");
    return [{ id: tasksQuestion, prompt, selection: "multiple", options: tasks, required: true }];
  }
  const options = labelled(asRecords(field(payload, "options")), "id", "label");
  const required = Number(field(payload, "minSelected") ?? 0) > 0;
  return [{ id: checkboxQuestion, prompt, selection: "multiple", options, required }];
}

/** What a resolved checkbox, verdict or task card was answered with. */
export function listCardAnswerOf(
  kind: string,
  status: string,
  result: JsonRecord | undefined,
): InboxAnswer {
  if (status === "rejected") {
    const note = text(result, "reason");
    return note === undefined
      ? { kind: "option", option: "reject" }
      : { kind: "option", option: "reject", note };
  }
  if (kind === "request_item_verdicts") {
    const answers = asRecords(field(result, "items")).flatMap((item) => {
      const question = text(item, "id");
      const verdict = text(item, "verdict");
      if (question === undefined || verdict === undefined) return [];
      const reason = text(item, "reason");
      const options = [verdict];
      return [reason === undefined ? { question, options } : { question, options, text: reason }];
    });
    return { kind: "answers", answers };
  }
  const picked =
    kind === "suggest_tasks"
      ? strings(field(result, "selectedClientKeys"))
      : strings(field(result, "selectedOptionIds"));
  const question = kind === "suggest_tasks" ? tasksQuestion : checkboxQuestion;
  return { kind: "answers", answers: [{ question, options: picked }] };
}

/**
 * The request that gives `answer` to a checkbox, verdict or task card, or
 * `undefined` when it doesn't fit: answers that don't fit its questions, a
 * checkbox pick outside `minSelected`/`maxSelected`, a verdict without the
 * reason its card asks for, or a reject without the reason a checkbox card
 * requires. A reject is the `reject` option with its reason as `note`; a
 * verdict card has none, since each item is rejected on its own.
 */
export function listCardAnswerRequest(
  kind: string,
  payload: JsonRecord | undefined,
  result: JsonRecord | undefined,
  answer: InboxAnswer,
): KindRequest | undefined {
  if (answer.kind === "option") {
    return kind === "request_item_verdicts" ? undefined : rejectRequest(payload, answer);
  }
  if (answer.kind !== "answers") {
    return undefined;
  }
  const questions = listCardQuestions(kind, payload, result, "");
  if (!questionsAnswerFits(questions, answer)) {
    return undefined;
  }
  if (kind === "request_item_verdicts") {
    return verdictsRequest(payload, answer);
  }
  const picked = [...(answer.answers[0]?.options ?? [])];
  if (kind === "suggest_tasks") {
    return { name: "acceptCard", body: { selectedClientKeys: picked } };
  }
  return pickFits(payload, picked.length)
    ? { name: "acceptCard", body: { selectedOptionIds: picked } }
    : undefined;
}

function rejectRequest(
  payload: JsonRecord | undefined,
  answer: Extract<InboxAnswer, { kind: "option" }>,
): KindRequest | undefined {
  if (answer.option !== "reject") {
    return undefined;
  }
  const reason = answer.note?.trim() ?? "";
  if (reason === "") {
    return field(payload, "rejectRequiresReason") === true
      ? undefined
      : { name: "rejectCard", body: {} };
  }
  return { name: "rejectCard", body: { reason } };
}

/** Whether a checkbox card takes this many picks: at least `minSelected`, at most `maxSelected`. */
function pickFits(payload: JsonRecord | undefined, count: number): boolean {
  const min = field(payload, "minSelected");
  const max = field(payload, "maxSelected");
  if (typeof min === "number" && count < min) return false;
  return typeof max !== "number" || count <= max;
}

/** The `verdicts` body for the items answered; at least one, each with a reason where its verdict needs one. */
function verdictsRequest(
  payload: JsonRecord | undefined,
  answer: InboxQuestionsAnswer,
): KindRequest | undefined {
  const needReason = reasonVerdicts(payload);
  const verdicts = answer.answers.flatMap((each) => {
    const verdict = each.options[0];
    if (verdict === undefined) return [];
    const reason = each.text?.trim() ?? "";
    return [
      reason === "" ? { id: each.question, verdict } : { id: each.question, verdict, reason },
    ];
  });
  const missingReason = verdicts.some(
    (each) => needReason.includes(each.verdict) && !("reason" in each),
  );
  if (verdicts.length === 0 || missingReason) {
    return undefined;
  }
  return { name: "submitVerdicts", body: { verdicts } };
}
