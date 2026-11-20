import { Button, Field, FilterChips, Input, Select } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { RoutineMailbox, RoutineTrigger } from "../api.ts";
import { ScheduleAdvanced, SignalFields } from "./advanced-fields.tsx";
import {
  cronFor,
  defaultMailTrigger,
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
  /** Whether the routine starts on its own. */
  readonly enabled: boolean;
  /** The Google connectors a mail trigger can watch; `undefined` while they are read, empty when there are none. */
  readonly mailboxes: readonly RoutineMailbox[] | undefined;
  /** Opens New connector, for the link under the Trigger picker; without it the window can't open one and there is no link. */
  readonly addConnector?: () => void;
  /** Called with the whole new trigger as soon as a field changes to a value that can be written. */
  readonly onChange: (trigger: RoutineTrigger) => void;
  /** Whether the Trigger picker should take the focus now. */
  readonly focusTrigger?: boolean;
  /** Called once the picker has taken the focus. */
  readonly onTriggerFocused?: (() => void) | undefined;
}

/**
 * The When card's trigger fields (`routines.when.trigger-fields`): the Trigger picker and, under
 * it, the fields of the kind picked. A trigger the picker can't switch to (a web request) is shown
 * as the kind it is and has no fields yet. Picking New mail with no Google connector writes
 * nothing, says to add one and, where the window can, links to New connector.
 */
export function TriggerFields({
  trigger,
  enabled,
  mailboxes,
  addConnector,
  onChange,
  focusTrigger,
  onTriggerFocused,
}: TriggerFieldsProps) {
  const picker = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusTrigger) return;
    picker.current?.focus();
    onTriggerFocused?.();
  }, [focusTrigger, onTriggerFocused]);
  const [triedMail, setTriedMail] = useState(false);
  // The error belongs to the list it was shown for: connectors that arrive take it away.
  const triggerError = triedMail ? mailboxProblem(mailboxes) : null;
  const kinds: readonly RoutineTrigger["kind"][] = (PICKABLE_KINDS as readonly string[]).includes(
    trigger.kind,
  )
    ? PICKABLE_KINDS
    : [...PICKABLE_KINDS, trigger.kind];
  const pick = (kind: string) => {
    if (kind === trigger.kind) return;
    if (kind === "mail") {
      setTriedMail(true);
      const first = mailboxes?.[0];
      if (first !== undefined) onChange(defaultMailTrigger(first.connector));
      return;
    }
    setTriedMail(false);
    onChange(defaultTrigger(kind as Exclude<PickableKind, "mail">, deviceTimeZone()));
  };
  return (
    <div className="flex flex-col gap-3">
      <Field label={words.trigger} error={triggerError}>
        <Select
          ref={picker}
          options={kinds.map((kind) => ({ value: kind, label: words.kinds[kind] }))}
          value={trigger.kind}
          onChange={pick}
        />
      </Field>
      {triggerError === words.addGoogleConnector && addConnector !== undefined && (
        <div>
          <Button variant="secondary" size="sm" onClick={addConnector}>
            {words.addGoogleConnectorLink}
          </Button>
        </div>
      )}
      {trigger.kind === "schedule" && (
        <ScheduleFields trigger={trigger} enabled={enabled} onChange={onChange} />
      )}
      {trigger.kind === "signal" && <SignalFields trigger={trigger} onChange={onChange} />}
      {trigger.kind === "mail" && (
        <MailFields trigger={trigger} mailboxes={mailboxes ?? []} onChange={onChange} />
      )}
      {trigger.kind === "every" && (
        <EveryFields
          interval={trigger.interval}
          onChange={(interval) => onChange({ kind: "every", interval })}
        />
      )}
    </div>
  );
}

/**
 * Days and At for a simple schedule; for a more detailed one, only the line that says so. Advanced
 * (cron and time zone) is under both, and opens by itself when the chips can't show the schedule.
 */
function ScheduleFields({
  trigger,
  enabled,
  onChange,
}: {
  readonly trigger: Extract<RoutineTrigger, { kind: "schedule" }>;
  readonly enabled: boolean;
  readonly onChange: (trigger: RoutineTrigger) => void;
}) {
  const schedule = simpleSchedule(trigger.cron);
  // Whether Advanced starts open is decided once: typing a simple line mustn't close it.
  const [openAtFirst] = useState(schedule === undefined);
  return (
    <>
      {schedule === undefined ? (
        <p className="text-small text-fg-muted">{words.moreDetailed}</p>
      ) : (
        <SimpleScheduleFields trigger={trigger} schedule={schedule} onChange={onChange} />
      )}
      <ScheduleAdvanced
        trigger={trigger}
        enabled={enabled}
        defaultOpen={openAtFirst}
        onChange={onChange}
      />
    </>
  );
}

/** The day chips and the time field. */
function SimpleScheduleFields({
  trigger,
  schedule,
  onChange,
}: {
  readonly trigger: Extract<RoutineTrigger, { kind: "schedule" }>;
  readonly schedule: SimpleSchedule;
  readonly onChange: (trigger: RoutineTrigger) => void;
}) {
  // The hint belongs to the line it was shown for, so a change made elsewhere takes it away.
  const [needsDayFor, setNeedsDayFor] = useState<string | undefined>();
  const needsDay = needsDayFor === trigger.cron;
  const write = (next: SimpleSchedule) => onChange({ ...trigger, cron: cronFor(next) });
  const toggleDay = (cron: number, pressed: boolean) => {
    const days = new Set(schedule.days);
    if (pressed) days.add(cron);
    else days.delete(cron);
    if (days.size === 0) {
      // The last day stays on; the hint stays until another day is turned on.
      setNeedsDayFor(trigger.cron);
      return;
    }
    setNeedsDayFor(undefined);
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
            name: day.name,
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

/**
 * The mailbox, the Gmail search and how often to check. The search is written once it isn't
 * empty; while it is, the field says so and the file keeps the last search.
 */
function MailFields({
  trigger,
  mailboxes,
  onChange,
}: {
  readonly trigger: Extract<RoutineTrigger, { kind: "mail" }>;
  readonly mailboxes: readonly RoutineMailbox[];
  readonly onChange: (trigger: RoutineTrigger) => void;
}) {
  const [query, setQuery] = useState<string | undefined>();
  const queryText = query ?? trigger.query;
  const known = mailboxes.some((mailbox) => mailbox.connector === trigger.connector);
  const options = [
    ...mailboxes.map((mailbox) => ({
      value: mailbox.connector,
      label: words.mailboxOption(mailbox.name, mailbox.account),
    })),
    // A connector the file names that the workspace doesn't offer stays selectable as it is.
    ...(known ? [] : [{ value: trigger.connector, label: trigger.connector }]),
  ];
  const changeQuery = (text: string) => {
    setQuery(text);
    if (text.trim() !== "") onChange({ ...trigger, query: text.trim() });
  };
  return (
    <>
      <Field label={words.mailbox}>
        <Select
          options={options}
          value={trigger.connector}
          onChange={(connector) => onChange({ ...trigger, connector })}
        />
      </Field>
      <Field
        label={words.search}
        hint={words.searchHint}
        error={queryText.trim() === "" ? words.searchNeeded : null}
      >
        <Input
          value={queryText}
          spellCheck={false}
          onChange={(event) => changeQuery(event.target.value)}
          onBlur={() => setQuery(undefined)}
        />
      </Field>
      <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
        <legend className="text-small text-fg-muted">{words.checkEvery}</legend>
        <EveryFields
          interval={trigger.every}
          onChange={(every) => onChange({ ...trigger, every })}
        />
      </fieldset>
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
    <div className="flex gap-3 phone:flex-wrap">
      <div className={COUNT_ON_A_PHONE}>
        <Field label={words.everyCount}>
          <Input
            type="number"
            min={1}
            value={countText}
            onChange={(event) => changeCount(event.target.value)}
          />
        </Field>
      </div>
      <div className={UNIT_ON_A_PHONE}>
        <Field label={words.everyUnit}>
          <Select
            options={EVERY_UNITS.map((value) => ({ value, label: words.units[value] }))}
            value={parsed === undefined ? "" : unit}
            placeholder={words.units[unit]}
            onChange={changeUnit}
          />
        </Field>
      </div>
    </div>
  );
}

/**
 * On a phone, Count and Unit share one row and both may shrink, so both end inside the card at
 * 320px; a number input won't go below its own width otherwise (HAL-13527). Unit keeps the width
 * of its word while there's room and Count takes the rest: half each cuts off "minutes" at 320px.
 * Count keeps a floor so its number still shows; below that the row wraps and Unit goes under
 * Count, as at 195px (400% zoom in a narrow window, HAL-14104).
 */
const COUNT_ON_A_PHONE = "phone:min-w-16 phone:flex-1";
const UNIT_ON_A_PHONE = "phone:min-w-0";

/** What a New mail pick runs into: nothing to watch yet, or the list still being read. */
function mailboxProblem(mailboxes: readonly RoutineMailbox[] | undefined): string | null {
  if (mailboxes === undefined) return words.readingMailboxes;
  return mailboxes.length === 0 ? words.addGoogleConnector : null;
}
