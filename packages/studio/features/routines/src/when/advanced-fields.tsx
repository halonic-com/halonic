import { isGuard } from "@halonicjs/format";
import { Disclosure, Field, Input, Select, TextArea } from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import type { RoutineTrigger } from "../api.ts";
import { checkCron, timeZoneError, zoneChoices } from "./cron-check.ts";
import { deviceTimeZone, whenWords as words } from "./when-words.ts";

/** How long typing pauses before a mistake is shown. */
const PAUSE_MS = 600;

/** A schedule's trigger, as the Advanced fields change it. */
type ScheduleTrigger = Extract<RoutineTrigger, { kind: "schedule" }>;
type SignalTrigger = Extract<RoutineTrigger, { kind: "signal" }>;

/** Props for {@link ScheduleAdvanced}. */
export interface ScheduleAdvancedProps {
  readonly trigger: ScheduleTrigger;
  /** Whether the routine starts on its own, which decides if the "last valid schedule" hint shows. */
  readonly enabled: boolean;
  /** Open at first, for a schedule the day chips can't show. */
  readonly defaultOpen: boolean;
  readonly onChange: (trigger: RoutineTrigger) => void;
}

/**
 * Advanced under a schedule (`routines.when.advanced`): the cron line with what it means, and the
 * time zone. A cron line is written as soon as the engine accepts it; while it doesn't, the file
 * keeps the last valid one.
 */
export function ScheduleAdvanced({
  trigger,
  enabled,
  defaultOpen,
  onChange,
}: ScheduleAdvancedProps) {
  return (
    <Disclosure summary={words.advanced} defaultOpen={defaultOpen}>
      <div className="flex flex-col gap-3 px-4 pb-3 phone:px-0">
        <CronField
          cron={trigger.cron}
          enabled={enabled}
          onChange={(cron) => onChange({ ...trigger, cron })}
        />
        <TimeZoneField
          timeZone={trigger.timeZone}
          onChange={(timeZone) => {
            const { timeZone: _previous, ...rest } = trigger;
            onChange(timeZone === undefined ? rest : { ...rest, timeZone });
          }}
        />
      </div>
    </Disclosure>
  );
}

/** What was typed in the cron field and the saved line it was typed over. */
interface CronDraft {
  readonly text: string;
  readonly base: string;
}

function CronField({
  cron,
  enabled,
  onChange,
}: {
  readonly cron: string;
  readonly enabled: boolean;
  readonly onChange: (cron: string) => void;
}) {
  const [draft, setDraft] = useState<CronDraft | undefined>();
  const [paused, setPaused] = useState(false);
  const [left, setLeft] = useState(false);
  // A draft typed over a line that has since changed (a day chip, an undo) is gone.
  const text = draft?.base === cron ? draft.text : cron;
  const check = checkCron(text);

  useEffect(() => {
    if (draft === undefined) return;
    const timer = setTimeout(() => setPaused(true), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  const change = (next: string) => {
    setDraft({ text: next, base: cron });
    setPaused(false);
    setLeft(false);
    if (checkCron(next).valid && next.trim() !== cron) onChange(next.trim());
  };
  const showError = !check.valid && (paused || left);
  return (
    <>
      <Field
        label={words.cron}
        hint={check.valid ? check.words : undefined}
        error={showError && !check.valid ? check.error : null}
        announceWhileFocused
      >
        <Input
          value={text}
          spellCheck={false}
          onChange={(event) => change(event.target.value)}
          onBlur={() => setLeft(true)}
        />
      </Field>
      <p className="text-small text-fg-muted">{words.cronHelp}</p>
      {showError && enabled && <p className="text-small text-fg-muted">{words.stillRunsOnLast}</p>}
    </>
  );
}

/** The value that stands for no time zone in the picker. */
const NO_ZONE = "";

function TimeZoneField({
  timeZone,
  onChange,
}: {
  readonly timeZone: string | undefined;
  readonly onChange: (timeZone: string | undefined) => void;
}) {
  const options = [
    { value: NO_ZONE, label: words.noTimeZone },
    ...zoneChoices(deviceTimeZone(), timeZone).map((zone) => ({ value: zone, label: zone })),
  ];
  return (
    <Field label={words.timeZone} error={timeZoneError(timeZone) ?? null}>
      <Select
        options={options}
        value={timeZone ?? NO_ZONE}
        onChange={(zone) => onChange(zone === NO_ZONE ? undefined : zone)}
      />
    </Field>
  );
}

/** Props for {@link SignalFields}. */
export interface SignalFieldsProps {
  readonly trigger: SignalTrigger;
  readonly onChange: (trigger: RoutineTrigger) => void;
}

/**
 * On a signal (`routines.when.signal-fields`): the signal's name, and under Advanced the
 * condition (`when`) as JSON, which is written once it parses and shown as a mistake when it
 * doesn't. A name can't be emptied: the last one stays in the file.
 */
export function SignalFields({ trigger, onChange }: SignalFieldsProps) {
  const [name, setName] = useState<string | undefined>();
  const [condition, setCondition] = useState<string | undefined>();
  const [left, setLeft] = useState(false);
  const saved = trigger.when === undefined ? "" : JSON.stringify(trigger.when);
  const conditionText = condition ?? saved;
  const nameText = name ?? trigger.name;
  const conditionValue = readCondition(conditionText);

  const changeName = (text: string) => {
    setName(text);
    if (text.trim() !== "") onChange({ ...trigger, name: text.trim() });
  };
  const changeCondition = (text: string) => {
    setCondition(text);
    setLeft(false);
    const value = readCondition(text);
    if (typeof value === "string") return;
    const { when: _previous, ...rest } = trigger;
    onChange(value === undefined ? rest : { ...rest, when: value });
  };
  return (
    <>
      <Field
        label={words.signalName}
        error={nameText.trim() === "" ? words.signalNameNeeded : null}
      >
        <Input
          value={nameText}
          spellCheck={false}
          onChange={(event) => changeName(event.target.value)}
          onBlur={() => setName(undefined)}
        />
      </Field>
      <Disclosure summary={words.advanced} defaultOpen={trigger.when !== undefined}>
        <div className="px-4 pb-3 phone:px-0">
          <Field
            label={words.onlyWhen}
            hint={words.onlyWhenHint}
            error={left ? conditionError(conditionValue) : null}
          >
            <TextArea
              value={conditionText}
              spellCheck={false}
              minRows={2}
              onChange={(event) => changeCondition(event.target.value)}
              onBlur={() => {
                setLeft(true);
                if (typeof conditionValue !== "string") setCondition(undefined);
              }}
            />
          </Field>
        </div>
      </Disclosure>
    </>
  );
}

type ConditionProblem = "not-json" | "not-condition";

/** The condition a text holds: `undefined` for none (empty), `"not-json"` or `"not-condition"` when it can't be used. */
function readCondition(text: string): SignalTrigger["when"] | ConditionProblem {
  if (text.trim() === "") return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return isGuard(value) ? value : "not-condition";
  } catch {
    return "not-json";
  }
}

function conditionError(value: ReturnType<typeof readCondition>): string | null {
  if (value === "not-json") return words.notJson;
  if (value === "not-condition") return words.notCondition;
  return null;
}
