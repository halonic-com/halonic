import { useId, useState } from "react";
import { Button } from "../button/button.tsx";
import { Checkbox } from "../checkbox/checkbox.tsx";
import { Field } from "../field/field.tsx";
import { TextArea } from "../input/text-area.tsx";
import { RadioGroup, type RadioOption } from "../radio/radio-group.tsx";
import { type MarkdownInline, readMarkdown } from "../text/markdown.ts";
import { calendarDay } from "../text/waiting-time.ts";
import {
  everyRequiredPicked,
  type FormAnswer,
  type FormPicks,
  type FormQuestion,
  formAnswers,
  otherChoice,
  picksFrom,
  toggledChoice,
  writesIn,
} from "./question-answers.ts";

/** The words the form shows. */
export const questionFormWords = {
  submit: "Submit",
  optional: "(optional)",
  /** Why Submit is off while a required question has no pick. */
  answerEach: "Answer each question to submit.",
  answered: (day: string) => `Answered ${day}`,
  /** Takes back the pick on an optional one-pick question. */
  clear: "Clear answer",
  /** What screen readers hear for it: which question it clears. */
  clearName: (prompt: string) => `Clear answer to ${prompt}`,
  /** The extra choice of a question that allows an answer of the person's own. */
  other: "Other",
  /** The label of the text field under a picked "Other" or free-text choice. */
  yourAnswer: "Your answer",
} as const;

/** The props of `QuestionForm`. */
export interface QuestionFormProps {
  readonly questions: readonly FormQuestion[];
  /**
   * Once the card is answered: what was picked and when. The form then only shows it. With
   * `reason`, the `id` of a line the card already shows about the answer, the form drops its own
   * "Answered" line and points its controls at that one instead.
   */
  readonly answered?:
    | {
        readonly answers: readonly FormAnswer[];
        readonly at: Date;
        readonly reason?: string | undefined;
      }
    | undefined;
  /** Called with one entry per question that has a pick. Not called while Submit is off. */
  readonly onSubmit: (answers: readonly FormAnswer[]) => void;
  /** While the answer is on its way. */
  readonly busy?: boolean;
  /** Submit is off for this reason too, such as the source being offline: the `id` of its line. */
  readonly unavailable?: { readonly reason: string } | undefined;
}

type ReadOnly = { readonly reason: string } | undefined;

/**
 * A card's questions as a form: each prompt a `fieldset` and `legend`, its options radios for a
 * `single` question and checkboxes for a `multiple` one, then **Submit**, off until every required
 * question has a pick. A question with `allowOther` adds an **Other** choice; picking it, or an
 * option with `freeText`, shows a **Your answer** field under the choices, which Submit sends as
 * the answer's `text` and which must not be blank. An optional `single` question's pick can be taken back with **Clear
 * answer**. Once `answered`, the picks stay ticked, every control is off and greyed,
 * and "Answered 24 Nov" takes Submit's place.
 *
 * @example
 * <QuestionForm questions={item.questions} onSubmit={(answers) => send({ kind: "answers", answers })} />
 */
export function QuestionForm({
  questions,
  answered,
  onSubmit,
  busy = false,
  unavailable,
}: QuestionFormProps) {
  const [picking, setPicking] = useState<FormPicks>({ picked: new Map(), written: new Map() });
  const answeredId = useId();
  const hintId = useId();
  const picks = answered === undefined ? picking : picksFrom(questions, answered.answers);
  const readOnly = answered === undefined ? undefined : { reason: answered.reason ?? answeredId };
  const ready = everyRequiredPicked(questions, picks);

  const pick = (question: string, options: ReadonlySet<string>) => {
    setPicking((before) => ({ ...before, picked: new Map(before.picked).set(question, options) }));
  };
  const write = (question: string, text: string) => {
    setPicking((before) => ({ ...before, written: new Map(before.written).set(question, text) }));
  };

  return (
    <form
      className="flex flex-col gap-4"
      data-question-form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && answered === undefined && unavailable === undefined && !busy) {
          onSubmit(formAnswers(questions, picks));
        }
      }}
    >
      {questions.map((question) => (
        <QuestionFieldset
          key={question.id}
          question={question}
          chosen={picks.picked.get(question.id) ?? new Set()}
          written={picks.written.get(question.id) ?? ""}
          readOnly={readOnly}
          onPick={(options) => pick(question.id, options)}
          onWrite={(text) => write(question.id, text)}
        />
      ))}
      {answered === undefined ? null : <AnsweredLine id={answeredId} answered={answered} />}
      {answered === undefined ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            unavailable={unavailable ?? (ready ? undefined : { reason: hintId })}
          >
            {questionFormWords.submit}
          </Button>
          {unavailable === undefined && !ready ? (
            <p id={hintId} className="text-small text-fg-muted">
              {questionFormWords.answerEach}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

/** "Answered 24 Nov" where Submit was, unless the card already says it on a line of its own. */
function AnsweredLine({
  id,
  answered,
}: {
  readonly id: string;
  readonly answered: { readonly at: Date; readonly reason?: string | undefined };
}) {
  if (answered.reason !== undefined) return null;
  return (
    <p id={id} className="text-small text-fg-muted">
      {questionFormWords.answered(calendarDay(answered.at))}
    </p>
  );
}

/**
 * One question: its prompt as the legend, then a radio or a checkbox per option, and "Other" when
 * it allows one. A picked written-text choice shows the Your answer field under them.
 */
function QuestionFieldset({
  question,
  chosen,
  written,
  readOnly,
  onPick,
  onWrite,
}: {
  readonly question: FormQuestion;
  readonly chosen: ReadonlySet<string>;
  readonly written: string;
  readonly readOnly: ReadOnly;
  readonly onPick: (options: ReadonlySet<string>) => void;
  readonly onWrite: (text: string) => void;
}) {
  return (
    // On a phone or touch screen the rows are tall enough on their own, as in the radio stack.
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0 phone:gap-0 touch:gap-0"
      data-question={question.id}
    >
      <legend className="mb-2 p-0 text-body font-medium text-fg">
        {promptText(question.prompt)}
        {question.required ? null : (
          <span className="font-normal text-fg-muted"> {questionFormWords.optional}</span>
        )}
      </legend>
      {question.selection === "single" ? (
        <SingleChoice question={question} chosen={chosen} readOnly={readOnly} onPick={onPick} />
      ) : (
        choices(question).map((choice) => (
          <Checkbox
            key={choice.id}
            checked={chosen.has(choice.id)}
            unavailable={readOnly}
            onChange={(on) => onPick(toggledChoice(question, chosen, choice.id, on))}
          >
            {choice.label}
          </Checkbox>
        ))
      )}
      {writesIn(question, chosen) ? (
        <Field label={questionFormWords.yourAnswer}>
          <TextArea
            value={written}
            disabled={readOnly !== undefined}
            {...(readOnly === undefined ? {} : { describedBy: readOnly.reason })}
            onChange={(event) => onWrite(event.target.value)}
          />
        </Field>
      ) : null}
    </fieldset>
  );
}

/**
 * A `single` question's radios. A radio can't be unpicked, so an optional question with a pick
 * gets a **Clear answer** button under them, until the card is answered.
 */
function SingleChoice({
  question,
  chosen,
  readOnly,
  onPick,
}: {
  readonly question: FormQuestion;
  readonly chosen: ReadonlySet<string>;
  readonly readOnly: ReadOnly;
  readonly onPick: (options: ReadonlySet<string>) => void;
}) {
  const prompt = promptText(question.prompt);
  const clearable = !question.required && readOnly === undefined && chosen.size > 0;
  return (
    <>
      <RadioGroup
        label={prompt}
        value={[...chosen][0] ?? null}
        onChange={(option) => onPick(new Set([option]))}
        options={choices(question).map(
          (choice): RadioOption =>
            readOnly === undefined
              ? { value: choice.id, label: choice.label }
              : // An answered card's radios are native `disabled`, described by the answered line.
                {
                  value: choice.id,
                  label: choice.label,
                  unavailable: true,
                  note: null,
                  reason: readOnly.reason,
                },
        )}
      />
      {clearable ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            name={questionFormWords.clearName(prompt)}
            onClick={(event) => {
              // The button goes once nothing is picked, so the focus moves to the first radio.
              event.currentTarget
                .closest("fieldset")
                ?.querySelector<HTMLInputElement>('input[type="radio"]')
                ?.focus();
              onPick(new Set());
            }}
          >
            {questionFormWords.clear}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** A question's options, then "Other" when it allows one. */
function choices(
  question: FormQuestion,
): readonly { readonly id: string; readonly label: string }[] {
  if (question.allowOther !== true) return question.options;
  return [...question.options, { id: otherChoice, label: questionFormWords.other }];
}

/**
 * A prompt is agent-written Markdown, but a legend holds a line of text, so its marks are read,
 * never shown, and its blocks join into one line.
 */
function promptText(prompt: string): string {
  return readMarkdown(prompt)
    .map((block) => {
      if (block.kind === "code") return block.text;
      if (block.kind === "list") return block.items.map(plainText).join(" ");
      return plainText(block.inlines);
    })
    .join(" ");
}

function plainText(inlines: readonly MarkdownInline[]): string {
  return inlines
    .map((inline) =>
      inline.kind === "strong" || inline.kind === "em" ? plainText(inline.children) : inline.text,
    )
    .join("");
}
