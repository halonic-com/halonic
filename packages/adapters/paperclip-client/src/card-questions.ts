// Paperclip's `ask_user_questions` cards that ask several questions, or one
// answered with several options or in writing (requirement
// `paperclip-client.question-cards`). A card with one single-select question
// and no written answer stays a plain item with `options`.
import {
  type InboxItemOption,
  type InboxQuestion,
  type InboxQuestionsAnswer,
  inboxQuestionOptionsMax,
  inboxQuestionsMax,
  questionsAnswerFits,
} from "@halonicjs/ports";
import { asList, asRecords, field, type JsonRecord, text } from "./json.ts";

/**
 * The options one question of a card offers, skipping any without an ID or a label. One that
 * Paperclip marks `freeText: true` keeps `freeText`.
 */
export function questionOptions(question: JsonRecord | undefined): InboxItemOption[] {
  return asRecords(field(question, "options"))
    .slice(0, inboxQuestionOptionsMax)
    .flatMap((option) => {
      const id = text(option, "id");
      const label = text(option, "label");
      if (id === undefined || label === undefined) {
        return [];
      }
      return field(option, "freeText") === true ? [{ id, label, freeText: true }] : [{ id, label }];
    });
}

/**
 * The questions of an `ask_user_questions` card's payload, or `undefined` when
 * it asks one single-select question with no written answer (or none), which
 * stays in `options`. A question without an ID is skipped, since no answer
 * could name it; one whose `required` is missing is required; one with
 * `allowOther: true` keeps `allowOther`.
 */
export function cardQuestions(payload: JsonRecord | undefined): InboxQuestion[] | undefined {
  const records = asRecords(field(payload, "questions"));
  const asksMore = records.some((record) => isMultiSelect(record) || takesWriting(record));
  if (records.length < 2 && !asksMore) {
    return undefined;
  }
  return records.slice(0, inboxQuestionsMax).flatMap((record) => {
    const id = text(record, "id");
    if (id === undefined) {
      return [];
    }
    const selection = isMultiSelect(record) ? "multiple" : "single";
    const prompt = text(record, "prompt") ?? "";
    const required = field(record, "required") !== false;
    const asked = { id, prompt, selection, options: questionOptions(record), required } as const;
    return [field(record, "allowOther") === true ? { ...asked, allowOther: true } : asked];
  });
}

// Paperclip names a multi-select question `"multi"` (`askUserQuestionsQuestionSchema`
// in 2026.1117.0); anything else is single-select, as Paperclip reads it.
function isMultiSelect(question: JsonRecord): boolean {
  return text(question, "selectionMode") === "multi";
}

// A plain item's options have no text field, so a question answered in writing asks `questions`.
function takesWriting(question: JsonRecord): boolean {
  return (
    field(question, "allowOther") === true ||
    asRecords(field(question, "options")).some((option) => field(option, "freeText") === true)
  );
}

/** An answered card's `answers` result as an `answers` answer: every question's options, and its written text. */
export function questionsAnswerOf(result: JsonRecord | undefined): InboxQuestionsAnswer {
  const answers = asRecords(field(result, "answers")).flatMap((record) => {
    const question = text(record, "questionId");
    if (question === undefined) {
      return [];
    }
    const options = asList(field(record, "optionIds")).filter(
      (option): option is string => typeof option === "string",
    );
    const written = text(record, "otherText");
    return [written === undefined ? { question, options } : { question, options, text: written }];
  });
  return { kind: "answers", answers };
}

/**
 * The `respondToCard` body for an `answers` answer to a card that asks
 * `questions`, or `undefined` when the answer doesn't fit them. Each answered
 * question becomes `{ questionId, optionIds }`, with its text as `otherText`.
 */
export function questionsAnswerBody(
  questions: readonly InboxQuestion[],
  answer: InboxQuestionsAnswer,
): Readonly<Record<string, unknown>> | undefined {
  if (!questionsAnswerFits(questions, answer)) {
    return undefined;
  }
  const answers = answer.answers.map((each) => {
    const otherText = each.text === undefined ? {} : { otherText: each.text };
    return { questionId: each.question, optionIds: [...each.options], ...otherText };
  });
  return { answers };
}
