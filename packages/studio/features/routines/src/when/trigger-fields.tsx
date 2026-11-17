import { Field, FilterChips, Input, Select } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { RoutineTrigger } from "../api.ts";
import {
  cronFor,
  defaultTrigger,
  EVERY_UNITS,
  type EveryUnit,
  intervalText,
  PICKABLE_KINDS,
  type PickableKind,
  readInterval,
  readTime,
  type SimpleSchedule,
  simpleSchedule,
  timeText,
  WEEK_DAYS,
} from "./trigger-values.ts";
import { deviceTimeZone, whenWords as words } from "./when-words.ts";

/** Props for {@link TriggerFields}. */
export interface TriggerFieldsProps {
  readonly trigger: RoutineTrigger;
  /** Called with the whole new trigger as soon as a field changes to a value that can be written. */
  readonly onChange: (trigger: RoutineTrigger) => void;
}

/**
 * The When card's trigger fields (`routines.when.trigger-fields`): the Trigger picker and, under
 * it, the fields of the kind picked. A trigger the picker can't switch to (mail, signal) is shown
 * as the kind it is and has no fields yet.
 */
export function TriggerFields({ trigger, onChange }: TriggerFieldsProps) {
  const kinds: readonly RoutineTrigger["kind"][] = (PICKABLE_KINDS as readonly string[]).includes(
    trigger.kind,
  )
    ? PICKABLE_KINDS
    : [...PICKABLE_KINDS, trigger.kind];
  const pick = (kind: string) => {
    if (kind === trigger.kind) return;
    onChange(defaultTrigger(kind as PickableKind, deviceTimeZone()));
  };
  return (
    <div className="flex flex-col gap-3">
      <Field label={words.trigger}>
        <Select
          options={kinds.map((kind) => ({ value: kind, label: words.kinds[kind] }))}
          value={trigger.kind}
          onChange={pick}
        />
      </Field>
      {trigger.kind === "schedule" && <ScheduleFields trigger={trigger} onChange={onChange} />}
      {trigger.kind === "every" && (
        <EveryFields
          interval={trigger.interval}
          onChange={(interval) => onChange({ kind: "every", interval })}
        />
      )}
    </div>
  );
}

/** Days and At for a simple schedule; for a more detailed one, only the line that says so. */
function ScheduleFields({
  trigger,
  onChange,
}: {
  readonly trigger: Extract<RoutineTrigger, { kind: "schedule" }>;
  readonly onChange: (trigger: RoutineTrigger) => void;
}) {
  const [needsDay, setNeedsDay] = useState(false);
  const schedule = simpleSchedule(trigger.cron);
  if (schedule === undefined) {
    return <p className="text-small text-fg-muted">{words.moreDetailed}</p>;
  }
  const write = (next: SimpleSchedule) => onChange({ ...trigger, cron: cronFor(next) });
  const toggleDay = (cron: number, pressed: boolean) => {
    const days = new Set(schedule.days);
    if (pressed) days.add(cron);
    else days.delete(cron);
    if (days.size === 0) {
      // The last day stays on; the hint stays until another day is turned on.
      setNeedsDay(true);
      return;
    }
    setNeedsDay(false);
    write({ ...schedule, days });
  };
  const changeTime = (text: string) => {
    const time = readTime(text);
    if (time !== undefined) write({ ...schedule, ...time });
  };
  return (
    <>
      <div className="flex flex-col gap-1">
        <FilterChips
          label={words.days}
          toggles={WEEK_DAYS.map((day) => ({
            label: day.label,
            pressed: schedule.days.has(day.cron),
            onChange: (pressed) => toggleDay(day.cron, pressed),
          }))}
        />
        {needsDay && (
          <p role="status" className="px-4 text-small text-fg-muted">
            {words.atLeastOneDay}
          </p>
        )}
      </div>
      <Field label={words.at}>
        <Input
          type="time"
          step={300}
          value={timeText(schedule.hour, schedule.minute)}
          onChange={(event) => changeTime(event.target.value)}
        />
      </Field>
    </>
  );
}

/** The largest count the engine reads (five digits). */
const MAX_COUNT = 99_999;

/** A count of one or more and a unit; empty for an interval the form can't show. */
function EveryFields({
  interval,
  onChange,
}: {
  readonly interval: string;
  readonly onChange: (interval: string) => void;
}) {
  const parsed = readInterval(interval);
  const [draft, setDraft] = useState<string | undefined>();
  const countText = draft ?? (parsed === undefined ? "" : String(parsed.count));
  const unit = parsed?.unit ?? "h";
  const changeCount = (text: string) => {
    setDraft(text);
    const count = Number(text);
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) return;
    onChange(intervalText({ count, unit }));
    setDraft(undefined);
  };
  const changeUnit = (next: string) =>
    onChange(intervalText({ count: parsed?.count ?? 1, unit: next as EveryUnit }));
  return (
    <div className="flex gap-3">
      <Field label={words.everyCount}>
        <Input
          type="number"
          min={1}
          value={countText}
          onChange={(event) => changeCount(event.target.value)}
        />
      </Field>
      <Field label={words.everyUnit}>
        <Select
          options={EVERY_UNITS.map((value) => ({ value, label: words.units[value] }))}
          value={parsed === undefined ? "" : unit}
          placeholder={words.units[unit]}
          onChange={changeUnit}
        />
      </Field>
    </div>
  );
}
