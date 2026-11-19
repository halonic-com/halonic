import { Disclosure, Field, Input, Select, TextArea } from "@halonicjs/studio-kit";
import { type AutoSaved, useAutoSaved, useReportNotSaved } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
import {
  type AgentChange,
  type AgentModelParams,
  type AgentModelParamsChange,
  type AgentReasoningEffort,
  agentReasoningEfforts,
} from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";

/** The check of a number box: `null` when it is empty, or a number from `min` to `max`. */
const numberFrom =
  (min: number, max: number, sentence: string) =>
  (text: string): string | null => {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    const value = Number(trimmed);
    return Number.isFinite(value) && value >= min && value <= max ? null : sentence;
  };

/** The sentence for a temperature that isn't a number from 0 to 2; `null` when fine or empty. */
export const temperatureCheck = numberFrom(0, 2, words.temperatureInvalid);

/** The sentence for a top-p that isn't a number from 0 to 1; `null` when fine or empty. */
export const topPCheck = numberFrom(0, 1, words.topPInvalid);

/** The sentence for max tokens that aren't a whole number above 0; `null` when fine or empty. */
export const maxTokensCheck = (text: string): string | null => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  return /^\d+$/.test(trimmed) && Number(trimmed) > 0 ? null : words.maxTokensInvalid;
};

const noMistake = (): null => null;

/** How a setting is typed: as text, which the file holds as a number or a list of lines. */
interface Typed<Value> {
  readonly show: (value: Value | undefined) => string;
  /** The value of a box with no mistake; `null` for an empty box, which takes it out of the file. */
  readonly read: (text: string) => Value | null;
}

const asNumber: Typed<number> = {
  show: (value) => (value === undefined ? "" : String(value)),
  read: (text) => (text.trim() === "" ? null : Number(text.trim())),
};

const asLines: Typed<readonly string[]> = {
  show: (value) => (value ?? []).join("\n"),
  read: (text) => {
    const lines = text.split(/\r?\n/).filter((line) => line !== "");
    return lines.length === 0 ? null : lines;
  },
};

/**
 * A model setting typed in a box that saves by itself. While what was typed last still reads as
 * the file's value, the box keeps it as typed ("0.50", a new line at the end), so the value coming
 * back from a save doesn't rewrite the box under the person's cursor.
 */
function useTypedSetting<Value>(
  value: Value | undefined,
  typed: Typed<Value>,
  save: (value: Value | null) => Promise<boolean>,
  check: (text: string) => string | null,
): AutoSaved {
  const last = useRef<string | undefined>(undefined);
  const same =
    last.current !== undefined &&
    JSON.stringify(typed.read(last.current)) === JSON.stringify(value ?? null);
  return useAutoSaved(
    same && last.current !== undefined ? last.current : typed.show(value),
    (text) => {
      last.current = text;
      return save(typed.read(text));
    },
    check,
  );
}

/** Props for {@link MoreSettings}. */
export interface MoreSettingsProps {
  readonly params: AgentModelParams;
  /** Saves one change; resolves to whether it was written. */
  readonly save: (change: AgentChange) => Promise<boolean>;
  /** Hears how many of its boxes aren't saved, for the page's count. */
  readonly reportNotSaved?: ((count: number) => void) | undefined;
}

/**
 * The Model page's **More settings** (`agents.configuration.more-settings`), folded: temperature,
 * top-p, max tokens, stop and reasoning effort. Each saves by itself, and an empty one takes the
 * setting out of the file, so the model's default applies. A number with a mistake isn't saved,
 * and counts as a field not saved, as does a box whose save failed. Folded, the row names the settings the file sets.
 */
export function MoreSettings({ params, save, reportNotSaved }: MoreSettingsProps) {
  const saveParams = (change: AgentModelParamsChange) => save({ params: change });
  const temperature = useTypedSetting(
    params.temperature,
    asNumber,
    (value) => saveParams({ temperature: value }),
    temperatureCheck,
  );
  const topP = useTypedSetting(
    params.topP,
    asNumber,
    (value) => saveParams({ topP: value }),
    topPCheck,
  );
  const maxTokens = useTypedSetting(
    params.maxTokens,
    asNumber,
    (value) => saveParams({ maxTokens: value }),
    maxTokensCheck,
  );
  const stop = useTypedSetting(
    params.stop,
    asLines,
    (value) => saveParams({ stop: value }),
    noMistake,
  );
  useReportNotSaved(reportNotSaved, [temperature, topP, maxTokens, stop]);
  const set = (["temperature", "topP", "maxTokens", "stop", "reasoningEffort"] as const)
    .filter((key) => params[key] !== undefined)
    .map((key) => words[key]);

  return (
    <Disclosure
      summary={words.moreSettings}
      {...(set.length === 0 ? {} : { detail: set.join(", ") })}
    >
      {/*
        The Disclosure's panel is inset and muted for a few lines of help. These are fields, so
        they cancel both: they line up with Model call limit's, and what's typed is in the text colour.
      */}
      <div className="-mx-4 flex flex-col gap-6 pt-2 text-body text-fg">
        <NumberField label={words.temperature} hint={words.temperatureHint} field={temperature} />
        <NumberField label={words.topP} hint={words.topPHint} field={topP} />
        <NumberField label={words.maxTokens} hint={words.maxTokensHint} field={maxTokens} />
        <Field label={words.stop} hint={words.stopHint}>
          <TextArea
            minRows={2}
            maxRows={6}
            spellCheck={false}
            value={stop.value}
            onChange={(event) => stop.onChange(event.target.value)}
            onBlur={stop.flush}
          />
        </Field>
        <EffortField
          effort={params.reasoningEffort}
          save={(effort) => saveParams({ reasoningEffort: effort })}
        />
      </div>
    </Disclosure>
  );
}

function NumberField({
  label,
  hint,
  field,
}: {
  readonly label: string;
  readonly hint: string;
  readonly field: AutoSaved;
}) {
  return (
    <Field label={label} hint={hint} error={field.error} announceWhileFocused>
      <Input
        inputMode="decimal"
        value={field.value}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.flush}
      />
    </Field>
  );
}

const effortOptions = [
  { value: "default", label: words.reasoningEfforts.default },
  ...agentReasoningEfforts.map((effort) => ({
    value: effort,
    label: words.reasoningEfforts[effort],
  })),
];

/** Reasoning effort, saved when it is picked; "Model's default" takes it out of the file. */
function EffortField({
  effort,
  save,
}: {
  readonly effort: AgentReasoningEffort | undefined;
  readonly save: (effort: AgentReasoningEffort | null) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<string>(effort ?? "default");
  useEffect(() => setPicked(effort ?? "default"), [effort]);
  return (
    <Field label={words.reasoningEffort} hint={words.reasoningEffortHint}>
      <Select
        options={effortOptions}
        value={picked}
        onChange={(next) => {
          setPicked(next);
          const chosen = agentReasoningEfforts.find((one) => one === next);
          void save(chosen ?? null);
        }}
      />
    </Field>
  );
}
