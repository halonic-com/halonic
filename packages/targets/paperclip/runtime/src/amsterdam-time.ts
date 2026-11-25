/**
 * Times in text for people are Amsterdam time with the zone named (board,
 * HAL-18903): "25 Nov 16:40 CET" in winter, "1 Jul 17:40 CEST" in summer.
 * The `Europe/Amsterdam` zone knows daylight saving time, so there is no fixed
 * offset. Data fields, logs and state keep their ISO times in UTC.
 */

// en-GB names the zone CET or CEST; en-US would say "GMT+1".
const amsterdam = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
});

/** An instant as "25 Nov 16:40 CET"; a value that isn't a time comes back as it is. */
export function amsterdamTime(at: Date | string | number): string {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) {
    return String(at);
  }
  const parts = amsterdam.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((found) => found.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("hour")}:${part("minute")} ${part("timeZoneName")}`;
}
