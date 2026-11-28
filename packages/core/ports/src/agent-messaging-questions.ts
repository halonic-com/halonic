// Inbox items that ask several questions, or one the person answers with
// several options (requirement `ports.agent-messaging-questions`). A single
// single-select question stays a plain item with `options` and an `option`
// answer, so apps and sources that only know those keep working.
import type { InboxAnswer, InboxItem, InboxItemOption, InboxWebLink } from "./agent-messaging.ts";
import { inboxItemKindFits } from "./agent-messaging-kinds.ts";
import { inboxReachFits } from "./agent-messaging-reach.ts";

/** The most questions one item asks; a source maps no more, the wire takes no more. */
export const inboxQuestionsMax = 20;

/** The most options one question offers or one answer picks. */
export const inboxQuestionOptionsMax = 50;

/**
 * One question of an inbox item that asks several, or that the person answers
 * with several options. `prompt` is agent-written Markdown, as the item's
 * `question`. `single` takes at most one option, `multiple` any number of
 * them; a `required` question takes at least one.
 */
export interface InboxQuestion {
  id: string;
  prompt: string;
  selection: "single" | "multiple";
  options: readonly InboxItemOption[];
  required: boolean;
  /**
   * Options the source suggests, which apps tick before the person answers.
   * A suggestion isn't an answer: only what the person sends is.
   */
  preselected?: readonly string[];
  /**
   * Apps offer an extra "Other" choice, answered in writing in the answer's `text`. Only `true`
   * counts. A question takes at most one written-text choice: "Other" or one `freeText` option.
   */
  allowOther?: boolean;
}

/** The person's answer to one {@link InboxQuestion}: the IDs of the options picked, in the order offered. */
export interface InboxQuestionAnswer {
  /** The question's `id`. */
  question: string;
  options: readonly string[];
  /**
   * The written answer, such as Paperclip's `otherText`. It belongs to the picked `freeText`
   * option when there is one, and must not be blank then. Otherwise, when the question has
   * `allowOther`, it is the "Other" answer, which a single-select question takes only with no
   * option picked; blank after trimming, it counts as no answer. A question with neither keeps
   * it as its source's own note, such as a verdict's reason.
   */
  text?: string;
}

/**
 * The answer to an item with `questions`: one entry per question answered,
 * each question at most once. It is the only answer such an item takes, and
 * no other item takes it.
 */
export interface InboxQuestionsAnswer {
  kind: "answers";
  answers: readonly InboxQuestionAnswer[];
}

/**
 * Whether an `answers` answer fits an item's questions: every question it
 * names is one the item asks, named once; every option it picks is one that
 * question offers, picked once; a `single` question has at most one option and
 * a `required` one at least one, or "Other" text that isn't blank; and its
 * `text` is one the question takes (see {@link InboxQuestionAnswer.text}).
 *
 * @example
 * questionsAnswerFits(questions, { kind: "answers", answers: [{ question: "repo", options: ["separate"] }] });
 */
export function questionsAnswerFits(
  questions: readonly InboxQuestion[],
  answer: InboxQuestionsAnswer,
): boolean {
  const named = answer.answers.map((each) => each.question);
  if (new Set(named).size !== named.length) return false;
  const fits = answer.answers.every((each) => {
    const question = questions.find((asked) => asked.id === each.question);
    return (
      question !== undefined && optionsFit(question, each.options) && writtenFits(question, each)
    );
  });
  if (!fits) return false;
  return questions.every(
    (question) =>
      !question.required ||
      answer.answers.some((each) => each.question === question.id && isAnswered(question, each)),
  );
}

function optionsFit(question: InboxQuestion, picked: readonly string[]): boolean {
  if (new Set(picked).size !== picked.length) return false;
  if (question.selection === "single" && picked.length > 1) return false;
  return picked.every((option) => question.options.some((offered) => offered.id === option));
}

// One `text` per question, so at most one written-text choice: a picked `freeText` option owns
// the text, or else it is "Other", which a single-select question takes only instead of an option.
// A question with neither keeps text as its source's own note, such as a verdict's reason.
function writtenFits(question: InboxQuestion, answer: InboxQuestionAnswer): boolean {
  const freeText = answer.options.filter((id) =>
    question.options.some((offered) => offered.id === id && offered.freeText === true),
  );
  if (freeText.length > 1) return false;
  if (freeText.length === 1) return isWritten(answer.text);
  if (answer.text === undefined || question.allowOther !== true) return true;
  return question.selection === "multiple" || answer.options.length === 0;
}

function isAnswered(question: InboxQuestion, answer: InboxQuestionAnswer): boolean {
  return answer.options.length > 0 || (question.allowOther === true && isWritten(answer.text));
}

function isWritten(text: string | undefined): boolean {
  return (text ?? "").trim() !== "";
}

/**
 * Whether an option answer fits an item's `options`: it names one the item
 * offers, with a note that isn't blank when that option needs one. An item
 * with `questions` takes no option it doesn't offer.
 */
export function optionAnswerFits(
  item: InboxItem,
  answer: Extract<InboxAnswer, { kind: "option" }>,
): boolean {
  const offered = item.options.find((option) => option.id === answer.option);
  if (offered === undefined) return item.questions === undefined;
  return offered.noteRequired !== true || (answer.note ?? "").trim() !== "";
}

/**
 * Whether a source's item holds together (requirement
 * `ports.agent-messaging-answer-elsewhere`): an `answerElsewhere` link is an
 * `https:` address, so is a `webLink`'s link, whose `site` names its place in 1 to 80
 * characters (requirement `ports.agent-messaging-web-link`), and each question's `preselected` options are ones it
 * offers, each once, at most one for a single-select question, and its `kind` agrees with
 * its fields (requirement `ports.agent-messaging-item-kind`), and its `reach` holds together
 * (requirement `ports.agent-messaging-reach`). A provider
 * leaves out an item that doesn't.
 *
 * @example
 * inboxItemFits({ ...item, answerElsewhere: { link: "http://acme.example/t/1" } }); // false
 */
export function inboxItemFits(item: InboxItem): boolean {
  if (!inboxItemKindFits(item) || !inboxReachFits(item)) return false;
  if (item.answerElsewhere !== undefined && !isHttps(item.answerElsewhere.link)) return false;
  if (item.webLink !== undefined && !webLinkFits(item.webLink)) return false;
  return (item.questions ?? []).every((question) => {
    const picked = question.preselected ?? [];
    if (question.selection === "single" && picked.length > 1) return false;
    return optionsFit(question, picked);
  });
}

const webLinkSiteMax = 80;

/** An `https://` address with a host and no user name, and no white space anywhere in it. */
const httpsLink = /^https:\/\/[^\s/?#@\\]+(?:[/?#]\S*)?$/i;

function webLinkFits(webLink: InboxWebLink): boolean {
  const site = webLink.site.trim();
  return isHttps(webLink.link) && site !== "" && webLink.site.length <= webLinkSiteMax;
}

function isHttps(link: string): boolean {
  return link.length <= 2000 && httpsLink.test(link);
}
