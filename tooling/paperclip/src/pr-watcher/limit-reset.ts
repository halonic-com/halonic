/**
 * When a seat or usage limit resets, read from the message of the run it
 * stopped (HAL-19254). Paperclip records no separate field for it: a
 * `provider_limit_wait` stop says "… is expected to reset at
 * 2026-11-26T07:00:00.000Z …", and a `provider_quota` stop passes on the
 * provider's own "… resets 7am (UTC)". Any other wording counts as no reset
 * time, so the caller keeps its fallback. Rules only, no I/O.
 */

/** Paperclip's wording: a full UTC time. */
const resetAtPattern = /reset at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/;

/** The provider's wording: an hour of the day in UTC, such as "resets 7am (UTC)" or "resets 7:30pm (UTC)". */
const resetsHourPattern = /resets (\d{1,2})(?::(\d{2}))? ?(am|pm) \(UTC\)/i;

const dayMs = 24 * 60 * 60 * 1000;

/** The full time in the message, in ms, or undefined when there is none. */
function fullResetTime(message: string): number | undefined {
  const match = resetAtPattern.exec(message);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const time = Date.parse(match[1]);
  return Number.isNaN(time) ? undefined : time;
}

/** Minutes after midnight for "7", "30", "pm", or undefined when it isn't a clock time. */
function minutesOfDay(hour: string, minute: string | undefined, half: string): number | undefined {
  const hours = Number(hour);
  const minutes = minute === undefined ? 0 : Number(minute);
  if (hours < 1 || hours > 12 || minutes > 59) {
    return undefined;
  }
  // 12am is midnight and 12pm is noon.
  const hoursOfDay = (hours % 12) + (half.toLowerCase() === "pm" ? 12 : 0);
  return hoursOfDay * 60 + minutes;
}

/**
 * The hour of the day in the message, in ms: its first occurrence after the
 * stop, since the provider names the next reset.
 */
function hourResetTime(message: string, stoppedAt: number): number | undefined {
  const match = resetsHourPattern.exec(message);
  if (match?.[1] === undefined || match[3] === undefined) {
    return undefined;
  }
  const minutes = minutesOfDay(match[1], match[2], match[3]);
  if (minutes === undefined) {
    return undefined;
  }
  const midnight = stoppedAt - (stoppedAt % dayMs);
  const sameDay = midnight + minutes * 60 * 1000;
  return sameDay > stoppedAt ? sameDay : sameDay + dayMs;
}

/**
 * When the limit that stopped a run resets, in ms since the epoch, from the
 * run's message and the time it stopped (an ISO string); undefined when the
 * message names no reset time.
 */
export function resetTimeOf(message: string | null, stoppedAt: string): number | undefined {
  if (message === null) {
    return undefined;
  }
  const stopped = Date.parse(stoppedAt);
  return (
    fullResetTime(message) ?? (Number.isNaN(stopped) ? undefined : hourResetTime(message, stopped))
  );
}
