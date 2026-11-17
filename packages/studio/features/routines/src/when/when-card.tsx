import { Callout, Card, Switch } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { failureReason } from "../page/page-words.ts";
import { useNextTimes } from "./use-next-times.ts";
import { deviceTimeZone, nextTime, whenWords as words } from "./when-words.ts";

/** Props for {@link WhenCard}. */
export interface WhenCardProps {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
  /** Reads text to screen readers, politely. */
  readonly announce: (text: string) => void;
}

/**
 * The When card (`routines.when.when-card`): the trigger in words, the On/Off switch that applies
 * at once, and the next start times from the live version. A routine that has never been live
 * can't be turned on here yet, and says so; a change that can't be saved is shown in the card and
 * the switch goes back to what is saved.
 */
export function WhenCard({ host, routine, announce }: WhenCardProps) {
  const reasonId = useId();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const manual = routine.trigger.kind === "manual";
  const neverLive = !routine.everLive;
  const times = useNextTimes(host, routine, routine.enabled && !neverLive && !manual, routine);
  const timeZone = routine.trigger.kind === "schedule" ? routine.trigger.timeZone : undefined;
  const shown = times?.times.map((iso) => nextTime(iso, timeZone, deviceTimeZone()));

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

  // Turning a routine that was never live on needs a version first; until that step exists, the
  // switch says so rather than doing nothing.
  const blocked = neverLive && !routine.enabled;
  return (
    <Card
      label={words.label}
      actions={
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
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-body">{routine.triggerSentence}</p>
        {blocked && (
          <p id={reasonId} className="text-small text-fg-muted">
            {words.makeLiveFirst}
          </p>
        )}
        {manual && <p className="text-small text-fg-muted">{words.manualOnly}</p>}
        {shown !== undefined && shown.length > 0 && (
          <p className="text-small">
            <span className="text-fg-muted">{words.next}</span> {shown.join(" · ")}
          </p>
        )}
        {times?.atNextCheck === true && (
          <p className="text-small">
            <span className="text-fg-muted">{words.next}</span> {words.atNextCheck}
          </p>
        )}
        {failure !== undefined && <Callout tone="danger">{failure}</Callout>}
      </div>
    </Card>
  );
}
