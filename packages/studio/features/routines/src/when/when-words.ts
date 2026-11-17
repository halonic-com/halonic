/** The When card's words (flow-routines 3.3 and 3.4, microcopy 12.3). */
export const whenWords = {
  label: "When",
  /** The switch's fixed accessible name; the visible On and Off are hidden from screen readers. */
  switchName: "Runs on its own",
  on: "On",
  off: "Off",
  next: "Next",
  manualOnly: "Starts only with Run now.",
  atNextCheck: "At the next check (it hasn't run yet)",
  makeLiveFirst: "Make this routine live first to turn it on.",
  isOff: (name: string) => `${name} is off. It only runs with Run now.`,
  isOn: (name: string, next: string | undefined) =>
    next === undefined ? `${name} is on.` : `${name} is on. Next: ${next}.`,
  trigger: "Trigger",
  kinds: {
    manual: "Manual only",
    schedule: "On a schedule",
    every: "Every …",
    mail: "New mail",
    signal: "On a signal",
    webhook: "From a web request",
  },
  days: "Days",
  atLeastOneDay: "Pick at least one day.",
  at: "At",
  moreDetailed: "This schedule is more detailed than the day picker. Edit it as cron below.",
  everyCount: "Count",
  everyUnit: "Unit",
  units: { m: "minutes", h: "hours", d: "days" },
  advanced: "Advanced",
  cron: "Schedule (cron)",
  cronHelp: "minute hour day month weekday · e.g. 0 8 * * 1-5, */15 * * * *, @daily",
  stillRunsOnLast: "Still runs on the last valid schedule until the cron is fixed.",
  timeZone: "Time zone",
  noTimeZone: "No time zone (uses the computer's)",
  signalName: "Signal name",
  signalNameNeeded: "Give the signal a name.",
  onlyWhen: "Only when",
  onlyWhenHint: "A condition on the signal's data, as JSON. Leave empty to start on every signal.",
  notJson: "Not valid JSON.",
  couldntSave: (reason: string) => `Couldn't save the change. ${reason}`,
} as const;

const shortDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const shortMonths = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** The IANA zone of this device, or `undefined` when it can't be read. */
export function deviceTimeZone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * One start time as the Next line shows it, "Fri 6 Nov 07:30", in the routine's time zone. A zone
 * that isn't the device's is named after the time: "Fri 6 Nov 07:30 (Europe/Amsterdam)".
 * Without a zone, or with one the engine knows and the device doesn't, the device's clock is used.
 */
export function nextTime(
  iso: string,
  timeZone: string | undefined,
  device: string | undefined,
): string {
  const moment = new Date(iso);
  const zone = timeZone ?? device;
  const parts = new Map(
    new Intl.DateTimeFormat("en-GB", {
      ...(zone !== undefined && { timeZone: zone }),
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(moment)
      .map((part) => [part.type, part.value] as const),
  );
  const day = parts.get("weekday") ?? shortDays[moment.getDay()];
  const month = parts.get("month") ?? shortMonths[moment.getMonth()];
  const text = `${day} ${parts.get("day")} ${month} ${parts.get("hour")}:${parts.get("minute")}`;
  return timeZone !== undefined && timeZone !== device ? `${text} (${timeZone})` : text;
}
