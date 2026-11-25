// Paperclip's `ask_user_questions` cards that ask several questions, or one
// answered with several options (requirement `paperclip-client.question-cards`).
// A card with one single-select question stays a plain item with `options`.
import {
  type InboxItemOption,
  type InboxQuestion,
  type InboxQuestionsAnswer,
  inboxQuestionOptionsMax,
  inboxQuestionsMax,
  questionsAnswerFits,
} from "@halonicjs/ports";
import { asList, asRecords, field, type JsonRecord, text } from "./json.ts";

/** The options one question of a card offers, skipping any without an ID or a label. */
export function questionOptions(question: JsonRecord | undefined): InboxItemOption[] {
  return asRecords(field(question, "options"))
    .slice(0, inboxQuestionOptionsMax)
    .flatMap((option) => {
      const id = text(option, "id");
      const label = text(option, "label");
      return id === undefined || label === undefined ? [] : [{ id, label }];
    });
}

/**
 * The questions of an `ask_user_questions` card's payload, or `undefined` when
 * it asks one single-select question (or none), which stays in `options`.
 * A question without an ID is skipped, since no answer could name it; one
 * whose `required` is missing is required.
 */
export function cardQuestions(payload: JsonRecord | undefined): InboxQuestion[] | undefined {
  const records = asRecords(field(payload, "questions"));
  const multiple = records.some((record) => text(record, "selectionMode") === "multiple");
  if (records.length < 2 && !multiple) {
    return undefined;
  }
  return records.slice(0, inboxQuestionsMax).flatMap((record) => {
    const id = text(record, "id");
    if (id === undefined) {
      return [];
    }
    const selection = text(record, "selectionMode") === "multiple" ? "multiple" : "single";
    const prompt = text(record, "prompt") ?? "";
    const required = field(record, "required") !== false;
    return [{ id, prompt, selection, options: questionOptions(record), required }];
  });
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
