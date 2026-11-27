// The kit doesn't depend on the ports, so these shapes are the parts of an inbox item's
// questions and answers it reads; `InboxQuestion` and `InboxQuestionAnswer` fit them as they are.

/**
 * One question a card asks: its prompt (Markdown), its options, and whether one or several are
 * picked. With `allowOther`, it offers an extra "Other" choice answered in writing; an option
 * with `freeText` is answered in writing too. Only `true` counts for either.
 */
export interface FormQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly selection: "single" | "multiple";
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
    readonly freeText?: boolean | undefined;
  }[];
  readonly required: boolean;
  readonly allowOther?: boolean | undefined;
}

/**
 * The options picked for one {@link FormQuestion}, by ID, in the order offered, and the written
 * answer of its "Other" choice or its picked `freeText` option.
 */
export interface FormAnswer {
  readonly question: string;
  readonly options: readonly string[];
  readonly text?: string;
}

/**
 * What the form holds while the person answers: each question's picks, by option ID or
 * {@link otherChoice}, and what is written for its written-text choice.
 */
export interface FormPicks {
  readonly picked: ReadonlyMap<string, ReadonlySet<string>>;
  readonly written: ReadonlyMap<string, string>;
}

/** The "Other" choice among a question's picks. No source names an option this way. */
export const otherChoice = "halonic:other";

/**
 * Each option picked for a card's questions, by its label, in the order answered, each followed
 * by the entry's written answer when it has one. An ID the card no longer offers shows as
 * itself, so nothing picked goes missing from the record.
 *
 * @example
 * answerLabels(questions, [{ question: "repo", options: ["separate"] }]); // ["Separate repo"]
 */
export function answerLabels(
  questions: readonly FormQuestion[] | undefined,
  answers: readonly FormAnswer[],
): string[] {
  return answers.flatMap((each) => {
    const offered = questions?.find((question) => question.id === each.question)?.options;
    const labels = each.options.map(
      (id) => offered?.find((option) => option.id === id)?.label ?? id,
    );
    return each.text === undefined ? labels : [...labels, each.text];
  });
}

/**
 * The answer a form sends from what is picked: one entry per question with a pick, in the order
 * asked, its options in the order offered, with what is written when a written-text choice is
 * picked.
 */
export function formAnswers(questions: readonly FormQuestion[], picks: FormPicks): FormAnswer[] {
  return questions.flatMap((question) => {
    const chosen = picks.picked.get(question.id) ?? new Set<string>();
    const options = question.options.map((option) => option.id).filter((id) => chosen.has(id));
    const text = writesIn(question, chosen) ? writtenText(picks, question.id) : "";
    if (text !== "") return [{ question: question.id, options, text }];
    return options.length === 0 ? [] : [{ question: question.id, options }];
  });
}

/**
 * Whether the form can be sent: every required question has a pick, and every picked
 * written-text choice has text that isn't blank.
 */
export function everyRequiredPicked(questions: readonly FormQuestion[], picks: FormPicks): boolean {
  return questions.every((question) => {
    const chosen = picks.picked.get(question.id) ?? new Set<string>();
    if (writesIn(question, chosen)) return writtenText(picks, question.id) !== "";
    return !question.required || question.options.some((option) => chosen.has(option.id));
  });
}

/** Whether a question's picks include its written-text choice: "Other", or a `freeText` option. */
export function writesIn(question: FormQuestion, chosen: ReadonlySet<string>): boolean {
  if (question.allowOther === true && chosen.has(otherChoice)) return true;
  return question.options.some((option) => option.freeText === true && chosen.has(option.id));
}

/**
 * The picks after a multiple-select question's choice is ticked or unticked. A question takes at
 * most one written-text choice, since its one written answer can't say which it belongs to, so
 * ticking one unticks any other.
 */
export function toggledChoice(
  question: FormQuestion,
  chosen: ReadonlySet<string>,
  choice: string,
  on: boolean,
): ReadonlySet<string> {
  const next = new Set(chosen);
  if (!on) {
    next.delete(choice);
    return next;
  }
  if (isWrittenChoice(question, choice)) {
    for (const each of chosen) if (isWrittenChoice(question, each)) next.delete(each);
  }
  next.add(choice);
  return next;
}

/** An answered card's picks: "Other" counts as picked when its text has no `freeText` option. */
export function picksFrom(
  questions: readonly FormQuestion[],
  answers: readonly FormAnswer[],
): FormPicks {
  const picked = new Map<string, ReadonlySet<string>>();
  const written = new Map<string, string>();
  for (const each of answers) {
    const chosen = new Set(each.options);
    const question = questions.find((asked) => asked.id === each.question);
    if (each.text !== undefined && question?.allowOther === true && !writesIn(question, chosen)) {
      chosen.add(otherChoice);
    }
    picked.set(each.question, chosen);
    if (each.text !== undefined) written.set(each.question, each.text);
  }
  return { picked, written };
}

function isWrittenChoice(question: FormQuestion, choice: string): boolean {
  if (choice === otherChoice) return true;
  return question.options.some((option) => option.id === choice && option.freeText === true);
}

function writtenText(picks: FormPicks, question: string): string {
  return (picks.written.get(question) ?? "").trim();
}
