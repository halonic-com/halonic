import { Disclosure, Field, Select } from "@halonicjs/studio-kit";
import {
  checkMaxTokens,
  checkStop,
  checkTemperature,
  checkTopP,
  type FieldCheck,
} from "./assistant-checks.ts";
import { type ReasoningEffort, reasoningEfforts } from "./assistant-prefs.ts";
import * as text from "./assistant-text.ts";
import { SavedTextField } from "./saved-text-field.tsx";

/** One tuning value the way {@link Tuning} needs it: shown, saved by itself, and whether the save failed. */
interface Shown<Value> {
  readonly value: Value;
  readonly failed: boolean;
  readonly save: (value: Value) => Promise<boolean>;
}

/** The props of {@link Tuning}. */
export interface TuningProps {
  readonly temperature: Shown<number | null>;
  readonly topP: Shown<number | null>;
  readonly maxTokens: Shown<number | null>;
  readonly stop: Shown<readonly string[]>;
  readonly reasoningEffort: Shown<ReasoningEffort>;
  /** Says a failed save in the dialog. */
  readonly saveTyped: (what: string, save: () => Promise<boolean>) => Promise<boolean>;
}

const effortOptions = reasoningEfforts.map((effort) => ({
  value: effort,
  label: effort === "" ? text.PROVIDER_DEFAULT : effort[0]?.toUpperCase() + effort.slice(1),
}));

const failed = (what: string, is: boolean) => (is ? text.notSaved(what) : null);
const numberText = (value: number | null) => (value === null ? "" : String(value));

/**
 * The "Tuning" row: temperature, top-p, max tokens, stop and reasoning effort, each saved by
 * itself; empty means the provider's default (`settings.ai-agent-tuning`).
 */
export function Tuning(props: TuningProps) {
  const { saveTyped } = props;
  const numberField = (
    label: string,
    what: string,
    shown: Shown<number | null>,
    check: (typed: string) => FieldCheck<number | null>,
  ) => (
    <SavedTextField
      label={label}
      stored={numberText(shown.value)}
      check={check}
      save={(value) => saveTyped(what, () => shown.save(value))}
      saveError={failed(what, shown.failed)}
    />
  );
  return (
    <Disclosure summary={text.TUNING}>
      <div className="flex flex-col gap-4">
        <p className="text-small text-fg-muted">{text.TUNING_HINT}</p>
        {numberField(text.TEMPERATURE, "the temperature", props.temperature, checkTemperature)}
        {numberField(text.TOP_P, "top-p", props.topP, checkTopP)}
        {numberField(text.MAX_TOKENS, "max tokens", props.maxTokens, checkMaxTokens)}
        <SavedTextField
          multiline
          label={text.STOP}
          hint={text.STOP_HINT}
          stored={props.stop.value.join("\n")}
          check={checkStop}
          save={(value) => saveTyped("stop", () => props.stop.save(value))}
          saveError={failed("stop", props.stop.failed)}
        />
        <Field
          label={text.REASONING_EFFORT}
          error={failed("reasoning effort", props.reasoningEffort.failed)}
        >
          <Select
            options={effortOptions}
            value={props.reasoningEffort.value}
            onChange={(picked) => {
              const effort = reasoningEfforts.find((name) => name === picked);
              if (effort !== undefined) {
                void saveTyped("reasoning effort", () => props.reasoningEffort.save(effort));
              }
            }}
          />
        </Field>
      </div>
    </Disclosure>
  );
}
