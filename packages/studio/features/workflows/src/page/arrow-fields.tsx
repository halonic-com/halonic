import { Checkbox, Field, Input, Select, type SelectOption, TextArea } from "@halonicjs/studio-kit";
import { useAutoSaved, useReportNotSaved } from "@halonicjs/studio-shell";
import { useState } from "react";
import type { WorkflowArrow, WorkflowArrowFieldChange } from "../api.ts";
import { keyCheck, noCheck, pickNow } from "./field-saving.ts";
import { pageWords } from "./page-words.ts";

const words = pageWords.arrows.fields;

/** Props for {@link ArrowFields}. */
export interface ArrowFieldsProps {
  readonly arrow: WorkflowArrow;
  /** The id of the fields' group, which the row's button controls. */
  readonly id: string;
  /** Every step of the workflow, which **To** offers. */
  readonly stepIds: readonly string[];
  /** The arrow leaves a wait step, so it can fire after a time instead of on an event. */
  readonly fromWait: boolean;
  /** Saves one field of the arrow; resolves to whether it was written. */
  readonly set: (change: WorkflowArrowFieldChange) => Promise<boolean>;
  /** Hears how many of its fields aren't saved, for the toolbar's "1 field not saved". */
  readonly reportNotSaved?: ((count: number) => void) | undefined;
}

/** An empty field takes its key out of the file. */
const orNone = (text: string): string | undefined => (text.trim() === "" ? undefined : text.trim());

/** The condition as its field shows it: the file's `when` as one line of JSON, or empty for none. */
const conditionText = (condition: unknown): string =>
  condition === undefined ? "" : JSON.stringify(condition);

/** The condition a field's text is; empty is none. Only for text that {@link conditionCheck} passes. */
const conditionOf = (text: string): unknown =>
  text.trim() === "" ? undefined : (JSON.parse(text) as unknown);

/** A condition is JSON, and like any field it may not hold a key. */
function conditionCheck(text: string): string | null {
  if (text.trim() === "") return null;
  try {
    JSON.parse(text);
  } catch {
    return words.badJson;
  }
  return keyCheck(text);
}

/**
 * An arrow's row expanded in the step card (flow-workflows 5.3): **To**, **On event** (or **After**
 * for a timer), **Condition (JSON)** and **Label**. Like the card's other fields, each saves by
 * itself when it is left or after a pause in typing, and a pick at once. A condition that isn't
 * JSON says "This isn't valid JSON." under it and isn't saved, so the file keeps the condition it
 * had; empty takes the condition out. A wait step's arrow offers "Use a timer instead".
 */
export function ArrowFields({
  arrow,
  id,
  stepIds,
  fromWait,
  set,
  reportNotSaved,
}: ArrowFieldsProps) {
  const to = useAutoSaved(arrow.to, (next) => set({ field: "to", value: next }), noCheck);
  const event = useAutoSaved(
    arrow.event ?? "",
    (next) => set({ field: "event", value: orNone(next) }),
    keyCheck,
  );
  const after = useAutoSaved(
    arrow.after ?? "",
    (next) => set({ field: "after", value: orNone(next) }),
    noCheck,
  );
  const condition = useAutoSaved(
    conditionText(arrow.condition),
    (next) => set({ field: "condition", value: conditionOf(next) }),
    conditionCheck,
  );
  const label = useAutoSaved(
    arrow.label ?? "",
    (next) => set({ field: "label", value: orNone(next) }),
    keyCheck,
  );
  // Ticking "Use a timer instead" only shows After: nothing is written until it has a time.
  const [timer, setTimer] = useState(arrow.after !== undefined);
  useReportNotSaved(reportNotSaved, [to, timer ? after : event, condition, label]);

  const pickTimer = (checked: boolean) => {
    setTimer(checked);
    if (!checked && arrow.after !== undefined) void set({ field: "after", value: undefined });
  };
  const options: readonly SelectOption[] = stepIds.map((stepId) => ({
    value: stepId,
    label: stepId,
  }));

  return (
    <div id={id} className="flex flex-col gap-3 border-l-2 border-border pl-3">
      <Field label={words.to}>
        <Select options={options} value={to.value} onChange={pickNow(to)} size="sm" />
      </Field>
      {(fromWait || arrow.after !== undefined) && (
        <Checkbox checked={timer} onChange={pickTimer}>
          {words.useTimer}
        </Checkbox>
      )}
      {timer ? (
        <Field label={words.after} hint={words.afterHint} error={after.error}>
          <Input
            value={after.value}
            onChange={(change) => after.onChange(change.target.value)}
            onBlur={after.flush}
          />
        </Field>
      ) : (
        <Field label={words.event} error={event.error}>
          <Input
            value={event.value}
            placeholder={words.eventNone}
            onChange={(change) => event.onChange(change.target.value)}
            onBlur={event.flush}
          />
        </Field>
      )}
      <Field label={words.condition} error={condition.error}>
        <TextArea
          minRows={1}
          maxRows={6}
          value={condition.value}
          onChange={(change) => condition.onChange(change.target.value)}
          onBlur={condition.flush}
        />
      </Field>
      <Field label={words.label} error={label.error}>
        <Input
          value={label.value}
          onChange={(change) => label.onChange(change.target.value)}
          onBlur={label.flush}
        />
      </Field>
    </div>
  );
}
