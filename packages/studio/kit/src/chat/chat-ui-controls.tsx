import type { OpenUiComponent } from "@halonicjs/openui-lang";
import { useId, useState } from "react";
import { Button } from "../button/button.tsx";
import { Card } from "../card/card.tsx";
import { Checkbox } from "../checkbox/checkbox.tsx";
import { Field } from "../field/field.tsx";
import { Input } from "../input/input.tsx";
import { TextArea } from "../input/text-area.tsx";
import { RadioGroup } from "../radio/radio-group.tsx";
import { Select } from "../select/select.tsx";
import { list, prop, text } from "./chat-ui-values.ts";

/**
 * The two parts of a reply that send a message (HAL-17107 design): a row of buttons and a form.
 * The agent's buttons are always `secondary` and small, with no icon, so they never look like
 * Studio's own approval button. Sending is the same as typing: nothing runs on its own.
 */

/** Sends a message as the person, as if they typed it; absent when the controls don't work. */
export type ChatUiSend = ((message: string) => void) | undefined;

/** The line under every button row: a click is the same as typing. */
export const BUTTONS_LINE = "A button sends its words as your message.";

/** The line under every form: sending it is the same as typing the answers. */
export const FORM_LINE = "Sends your answers as your message.";

interface ControlProps {
  readonly part: OpenUiComponent;
  readonly onSend: ChatUiSend;
}

/** A button's words go out as the message; without `onSend` the buttons can't be used. */
export function AgentButtons({ part, onSend }: ControlProps) {
  const lineId = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {list<OpenUiComponent>(prop(part, "buttons")).map((button, index) => {
          const label = text(prop(button, "label"));
          return (
            <Button
              key={index}
              variant="secondary"
              size="sm"
              unavailable={onSend === undefined ? { reason: lineId } : undefined}
              onClick={() => onSend?.(label)}
            >
              {label}
            </Button>
          );
        })}
      </div>
      <p id={lineId} className="text-small text-fg-muted">
        {BUTTONS_LINE}
      </p>
    </div>
  );
}

type Answer = string | boolean;

/**
 * The form sends one message: the send button's words, then `Label: answer` per field, a tick
 * box as `yes` or `no` and an unanswered field empty.
 */
export function AgentForm({ part, onSend }: ControlProps) {
  const lineId = useId();
  const fields = list<OpenUiComponent>(prop(part, "fields"));
  const [answers, setAnswers] = useState<readonly Answer[]>(() =>
    fields.map((field) => (prop(field, "kind") === "tickBox" ? false : "")),
  );
  const submit = text(prop(part, "submit"));
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
        {fields.map((field, index) => (
          <FormField
            key={index}
            field={field}
            value={answers[index] ?? ""}
            onChange={(value) => answer(index, value)}
          />
        ))}
        <div className="flex flex-col items-start gap-2">
          <Button
            variant="secondary"
            unavailable={onSend === undefined ? { reason: lineId } : undefined}
            onClick={send}
          >
            {submit}
          </Button>
          <p id={lineId} className="text-small text-fg-muted">
            {FORM_LINE}
          </p>
        </div>
      </div>
    </Card>
  );
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
