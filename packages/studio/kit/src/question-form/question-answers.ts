// The kit doesn't depend on the ports, so these shapes are the parts of an inbox item's
// questions and answers it reads; `InboxQuestion` and `InboxQuestionAnswer` fit them as they are.

/** One question a card asks: its prompt (Markdown), its options, and whether one or several are picked. */
export interface FormQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly selection: "single" | "multiple";
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly required: boolean;
}

/** The options picked for one {@link FormQuestion}, by ID, in the order offered. */
export interface FormAnswer {
  readonly question: string;
  readonly options: readonly string[];
}

/**
 * Each option picked for a card's questions, by its label, in the order answered. An ID the
 * card no longer offers shows as itself, so nothing picked goes missing from the record.
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
    return each.options.map((id) => offered?.find((option) => option.id === id)?.label ?? id);
  });
}

/**
 * The answer a form sends from what is picked: one entry per question with a pick, in the order
 * asked, its options in the order offered.
 */
export function formAnswers(
  questions: readonly FormQuestion[],
  picked: ReadonlyMap<string, ReadonlySet<string>>,
): FormAnswer[] {
  return questions.flatMap((question) => {
    const chosen = picked.get(question.id);
    const options = question.options.map((option) => option.id).filter((id) => chosen?.has(id));
    return options.length === 0 ? [] : [{ question: question.id, options }];
  });
}

/** Whether every required question has a pick, so the form can be sent. */
export function everyRequiredPicked(
  questions: readonly FormQuestion[],
  picked: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  return questions.every(
    (question) => !question.required || (picked.get(question.id)?.size ?? 0) > 0,
  );
}
