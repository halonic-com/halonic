import { Callout, Card, Switch } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import type { RoutinesHost, RoutineTrigger, RoutineView } from "../api.ts";
import { failureReason } from "../page/page-words.ts";
import { OnTimeHint } from "./on-time-hint.tsx";
import { TriggerFields } from "./trigger-fields.tsx";
import { useMailboxes } from "./use-mailboxes.ts";
import { useNextTimes } from "./use-next-times.ts";
import { deviceTimeZone, nextTime, whenWords as words } from "./when-words.ts";

/** Props for {@link WhenCard}. */
export interface WhenCardProps {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
  /** Reads text to screen readers, politely. */
  readonly announce: (text: string) => void;
  /** Opens New connector, for the link shown when a mail trigger has no Google connector to watch; without it there is no link. */
  readonly addConnector?: () => void;
  /** Whether the Trigger picker should take the focus now. */
  readonly focusTrigger?: boolean;
  /** Called once the picker has taken the focus. */
  readonly onTriggerFocused?: () => void;
}

/**
 * The When card (`routines.when.when-card`): the trigger in words, the On/Off switch that applies
 * at once, and the next start times from the live version, with the line that only
 * `halonic routines watch` keeps them; a mail routine says mail doesn't start it yet. A routine
 * that has never been live can't be turned on here yet, and says so; a change that can't be saved
 * is shown in the card and the switch goes back to what is saved.
 */
export function WhenCard({
  host,
  routine,
  announce,
  addConnector,
  focusTrigger,
  onTriggerFocused,
}: WhenCardProps) {
  const reasonId = useId();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const mailboxes = useMailboxes(host, routine);
  const manual = routine.trigger.kind === "manual";
  const neverLive = !routine.everLive;
  const times = useNextTimes(host, routine, routine.enabled && !neverLive && !manual, routine);
  const timeZone = routine.trigger.kind === "schedule" ? routine.trigger.timeZone : undefined;
  const shown = times?.times.map((iso) => nextTime(iso, timeZone, deviceTimeZone())) ?? [];
  const mail = routine.trigger.kind === "mail";

  const newTriggerNotLive = notLiveLine(routine);

  const turn = async (enabled: boolean) => {
    if (saving) return;
    setSaving(true);
    setFailure(undefined);
    try {
      await host.save(routine, { enabled });
      if (!enabled) {
        announce(words.isOff(routine.name));
      } else {
        const next = await host.nextTimes(routine, 1).catch(() => undefined);
        const first = next?.times[0];
        announce(words.isOn(routine.name, first && nextTime(first, timeZone, deviceTimeZone())));
      }
    } catch (error) {
      setFailure(words.couldntSave(failureReason(error)));
    } finally {
      setSaving(false);
    }
  };

  const changeTrigger = async (trigger: RoutineTrigger) => {
    setFailure(undefined);
    try {
      await host.save(routine, { trigger });
    } catch (error) {
      setFailure(words.couldntSave(failureReason(error)));
    }
  };

  // Turning a routine that was never live on needs a version first; until that step exists, the
  // switch says so rather than doing nothing. A manual routine has no switch, so nothing to say.
  const blocked = neverLive && !routine.enabled && !manual;
  // A manual routine never runs on its own, so the switch would say nothing true; the card says
  // "Starts only with Run now." instead and the switch comes back with another trigger.
  return (
    <Card
      label={words.label}
      actions={
        !manual && (
          <>
            <span aria-hidden="true" className="text-small text-fg-muted">
              {routine.enabled ? words.on : words.off}
            </span>
            <Switch
              label={words.switchName}
              checked={routine.enabled}
              onChange={(enabled) => void turn(enabled)}
              {...(blocked && { unavailable: { reason: reasonId } })}
            />
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-body">{routine.triggerSentence}</p>
        <TriggerFields
          trigger={routine.trigger}
          enabled={routine.enabled}
          mailboxes={mailboxes}
          {...(addConnector && { addConnector })}
          focusTrigger={focusTrigger ?? false}
          onTriggerFocused={onTriggerFocused}
          onChange={(trigger) => void changeTrigger(trigger)}
        />
        {blocked && (
          <p id={reasonId} className="text-small text-fg-muted">
            {words.makeLiveFirst}
          </p>
        )}
        {newTriggerNotLive !== undefined && (
          <p className="text-small text-fg-muted">{newTriggerNotLive}</p>
        )}
        {manual && <p className="text-small text-fg-muted">{words.manualOnly}</p>}
        <NextTimesLines shown={shown} atNextCheck={times?.atNextCheck === true} />
        {mail && <p className="text-small text-fg-muted">{words.mailNotChecked}</p>}
        {failure !== undefined && <Callout tone="danger">{failure}</Callout>}
      </div>
    </Card>
  );
}

/** The line that says what still runs while the saved trigger isn't live; nothing when they agree. */
function notLiveLine(routine: RoutineView): string | undefined {
  const live = routine.live?.triggerSentence;
  if (live === undefined || live === routine.triggerSentence) return undefined;
  const scheduled = routine.trigger.kind === "schedule" || routine.trigger.kind === "every";
  return (scheduled ? words.newScheduleNotLive : words.newTriggerNotLive)(live);
}

/**
 * The next start times in words, or "at the next check", followed by the line that only
 * `halonic routines watch` starts them on time. Shows nothing when there is no next start.
 */
function NextTimesLines({
  shown,
  atNextCheck,
}: {
  readonly shown: readonly string[];
  readonly atNextCheck: boolean;
}) {
  if (shown.length === 0 && !atNextCheck) return null;
  return (
    <>
      {shown.length > 0 && (
        <p className="text-small">
          <span className="text-fg-muted">{words.next}</span> {shown.join(" · ")}
        </p>
      )}
      {atNextCheck && (
        <p className="text-small">
          <span className="text-fg-muted">{words.next}</span> {words.atNextCheck}
        </p>
      )}
      <p className="text-small text-fg-muted">
        <OnTimeHint of="routine" />
      </p>
    </>
  );
}
