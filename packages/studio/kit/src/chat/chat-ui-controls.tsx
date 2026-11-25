import type { OpenUiComponent } from "@halonicjs/openui-lang";
import { useId, useState } from "react";
import { Button } from "../button/button.tsx";
import { Card } from "../card/card.tsx";
import { Checkbox } from "../checkbox/checkbox.tsx";
import { Field } from "../field/field.tsx";
import { TickIcon } from "../icons/tick-icon.tsx";
import { Input } from "../input/input.tsx";
import { TextArea } from "../input/text-area.tsx";
import { RadioGroup } from "../radio/radio-group.tsx";
import { Select } from "../select/select.tsx";
import { list, prop, text } from "./chat-ui-values.ts";

/**
 * The two parts of a reply that send a message (HAL-17107 design): a row of buttons and a form.
 * The agent's buttons are always `secondary` and small, with no icon, so they never look like
 * Studio's own approval button; the only mark is Studio's tick on the one a message came from.
 * Sending is the same as typing: nothing runs on its own.
 */

/** Sends a message as the person, as if they typed it; absent when the controls don't work. */
export type ChatUiSend = ((message: string) => void) | undefined;

/** The line under every button row: a click is the same as typing. */
export const BUTTONS_LINE = "A button sends its words as your message.";

/** The line under every form: sending it is the same as typing the answers. */
export const FORM_LINE = "Sends your answers as your message.";

/** The line under a used form, which stays as a record of what was sent. */
export const FORM_SENT_LINE = "You sent your answers.";

/** The line under the controls of a reply the person answered some other way. */
export const EARLIER_LINE = "These were for an earlier reply. Type your answer instead.";

/** The line under a row of buttons once one was used: "You sent “Not now”.". */
export function buttonSentLine(label: string): string {
  return `You sent “${label}”.`;
}

interface ControlProps {
  readonly part: OpenUiComponent;
  readonly onSend: ChatUiSend;
  /** The message sent after this reply: its controls are a record, the one it came from ticked. */
  readonly answered: string | undefined;
}

/** A button's words go out as the message; without `onSend` the buttons can't be used. */
export function AgentButtons({ part, onSend, answered }: ControlProps) {
  const lineId = useId();
  const labels = list<OpenUiComponent>(prop(part, "buttons")).map((button) =>
    text(prop(button, "label")),
  );
  const used = answered !== undefined && labels.includes(answered);
  let line = BUTTONS_LINE;
  if (used) line = buttonSentLine(answered);
  else if (answered !== undefined) line = EARLIER_LINE;
  const live = onSend !== undefined && answered === undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {labels.map((label, index) => (
          <Button
            key={index}
            variant="secondary"
            size="sm"
            unavailable={live ? undefined : { reason: lineId }}
            icon={used && label === answered ? <TickIcon /> : undefined}
            onClick={() => onSend?.(label)}
          >
            {label}
          </Button>
        ))}
      </div>
      <p id={lineId} className="text-small text-fg-muted">
        {line}
      </p>
    </div>
  );
}

type Answer = string | boolean;

/**
 * The form sends one message: the send button's words, then `Label: answer` per field, a tick
 * box as `yes` or `no` and an unanswered field empty.
 */
export function AgentForm({ part, onSend, answered }: ControlProps) {
  const lineId = useId();
  const fields = list<OpenUiComponent>(prop(part, "fields"));
  const submit = text(prop(part, "submit"));
  const used = answered === submit || answered?.startsWith(`${submit}\n`) === true;
  const [answers, setAnswers] = useState<readonly Answer[]>(() =>
    fields.map((field) => answerIn(used ? answered : undefined, field)),
  );
  const live = onSend !== undefined && answered === undefined;
  let line = FORM_LINE;
  if (used) line = FORM_SENT_LINE;
  else if (answered !== undefined) line = EARLIER_LINE;
  function answer(index: number, value: Answer) {
    setAnswers((before) => before.map((old, at) => (at === index ? value : old)));
  }
  function send() {
    // An unanswered field still gets its line, so the agent sees every question.
    const lines = fields.map(
      (field, index) => `${text(prop(field, "label"))}: ${answerWords(answers[index])}`,
    );
    onSend?.([submit, ...lines].join("\n"));
  }
  return (
    <Card title={text(prop(part, "title"))}>
      <div className="flex flex-col gap-4">
        {/* A form that can't be sent can't be changed either, so it reads as a record. */}
        <fieldset className="contents" disabled={!live}>
          {fields.map((field, index) => (
            <FormField
              key={index}
              field={field}
              value={answers[index] ?? ""}
              onChange={(value) => answer(index, value)}
            />
          ))}
        </fieldset>
        <div className="flex flex-col items-start gap-2">
          <Button
            variant="secondary"
            unavailable={live ? undefined : { reason: lineId }}
            icon={used ? <TickIcon /> : undefined}
            onClick={send}
          >
            {submit}
          </Button>
          <p id={lineId} className="text-small text-fg-muted">
            {line}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** A field's answer in a sent form's message (`Label: answer`), or empty when it has none. */
function answerIn(message: string | undefined, field: OpenUiComponent): Answer {
  const tickBox = prop(field, "kind") === "tickBox";
  const start = `${text(prop(field, "label"))}: `;
  const line = message?.split("\n").find((each) => each.startsWith(start));
  const words = line?.slice(start.length) ?? "";
  return tickBox ? words === "yes" : words;
}

function answerWords(value: Answer | undefined): string {
  if (typeof value !== "boolean") return value ?? "";
  return value ? "yes" : "no";
}

interface FormFieldProps {
  readonly field: OpenUiComponent;
  readonly value: Answer;
  readonly onChange: (value: Answer) => void;
}

/** One field, by its kind: text, long text, list, choice or tick box. */
function FormField({ field, value, onChange }: FormFieldProps) {
  const label = text(prop(field, "label"));
  const words = typeof value === "string" ? value : "";
  const options = list(prop(field, "options")).map((option) => ({
    value: text(option),
    label: text(option),
  }));
  switch (prop(field, "kind")) {
    case "tickBox":
      return (
        <Checkbox checked={value === true} onChange={onChange}>
          {label}
        </Checkbox>
      );
    case "choice":
      return (
        <Field label={label}>
          <RadioGroup value={words === "" ? null : words} onChange={onChange} options={options} />
        </Field>
      );
    case "list":
      return (
        <Field label={label}>
          <Select value={words} onChange={onChange} options={options} />
        </Field>
      );
    case "longText":
      return (
        <Field label={label}>
          <TextArea value={words} minRows={2} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    default:
      return (
        <Field label={label}>
          <Input value={words} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
  }
}
