// The kit doesn't depend on the ports, so these shapes are the parts of an inbox item's
// questions and answers it reads; `InboxQuestion` and `InboxQuestionAnswer` fit them as they are.

/** One question a card asks: its prompt (Markdown), its options, and whether one or several are picked. */
export interface FormQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly selection: "single" | "multiple";
  readonly options: readonly FormOption[];
  readonly required: boolean;
}

/**
 * One option of a {@link FormQuestion}. Picking one with `noteRequired` or `noteLabel` shows a
 * field for its note, labelled `noteLabel`, else the option's own label.
 */
export interface FormOption {
  readonly id: string;
  readonly label: string;
  /** The note can't be blank, such as the reason for a reject. */
  readonly noteRequired?: boolean | undefined;
  readonly noteLabel?: string | undefined;
}

/** The options picked for one {@link FormQuestion}, by ID, in the order offered, with the note written for them. */
export interface FormAnswer {
  readonly question: string;
  readonly options: readonly string[];
  readonly text?: string;
}

/**
 * The option picked for a question that takes a note, the first one offered, or none.
 *
 * @example
 * noteOptionOf(verdictQuestion, new Set(["reject"])); // the Reject option, which needs a reason
 */
export function noteOptionOf(
  question: FormQuestion,
  chosen: ReadonlySet<string> | undefined,
): FormOption | undefined {
  return question.options.find(
    (option) =>
      chosen?.has(option.id) === true &&
      (option.noteRequired === true || option.noteLabel !== undefined),
  );
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
 * asked, its options in the order offered, and the note written for it as `text` when its pick
 * takes one and the note isn't blank.
 */
export function formAnswers(
  questions: readonly FormQuestion[],
  picked: ReadonlyMap<string, ReadonlySet<string>>,
  notes: ReadonlyMap<string, string> = new Map(),
): FormAnswer[] {
  return questions.flatMap((question) => {
    const chosen = picked.get(question.id);
    const options = question.options.map((option) => option.id).filter((id) => chosen?.has(id));
    if (options.length === 0) return [];
    const note = noteOptionOf(question, chosen) === undefined ? "" : writtenNote(notes, question);
    return [
      note === ""
        ? { question: question.id, options }
        : { question: question.id, options, text: note },
    ];
  });
}

/**
 * Whether the form can be sent: every required question has a pick, and every pick that needs a
 * note has one that isn't blank.
 */
export function everyRequiredPicked(
  questions: readonly FormQuestion[],
  picked: ReadonlyMap<string, ReadonlySet<string>>,
  notes: ReadonlyMap<string, string> = new Map(),
): boolean {
  return questions.every((question) => {
    const chosen = picked.get(question.id);
    if (question.required && (chosen?.size ?? 0) === 0) return false;
    return (
      noteOptionOf(question, chosen)?.noteRequired !== true || writtenNote(notes, question) !== ""
    );
  });
}

function writtenNote(notes: ReadonlyMap<string, string>, question: FormQuestion): string {
  return notes.get(question.id)?.trim() ?? "";
}
