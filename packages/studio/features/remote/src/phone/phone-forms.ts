/**
 * The plural and time forms of the phone's tunnel screens, as the strings
 * table on HAL-12233 writes them ("Plural and time forms"). Never a
 * hand-made "(s)".
 */

const months = [
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

const two = (n: number): string => String(n).padStart(2, "0");

/** "14:02": the 24-hour time, as the Studio and the CLI write it. */
export function timeOf(moment: Date): string {
  return `${two(moment.getHours())}:${two(moment.getMinutes())}`;
}

/** "14 Nov", with the year when it isn't this year's: "14 Nov 2025". */
export function dayOf(moment: Date, now: Date): string {
  const day = `${moment.getDate()} ${months[moment.getMonth()]}`;
  return moment.getFullYear() === now.getFullYear() ? day : `${day} ${moment.getFullYear()}`;
}

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * `{asOf}`: "14:02" today, "yesterday 14:02", else "14 Nov 14:02". Used in
 * "as of {asOf}" and "Last update {asOf}.".
 */
export function asOfText(moment: Date, now: Date): string {
  if (sameDay(moment, now)) return timeOf(moment);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(moment, yesterday)) return `yesterday ${timeOf(moment)}`;
  return `${dayOf(moment, now)} ${timeOf(moment)}`;
}

const counted = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** `{triesLeft}`: "4 tries left", "1 try left". Zero is never shown: the code has ended. */
export function triesLeftText(triesLeft: number): string {
  return `${counted(triesLeft, "try", "tries")} left`;
}

/**
 * `{seconds}`: the wait before the next reconnect try in whole seconds,
 * rounded up, so the first 0.5 s tries read "1 second".
 */
export function secondsText(waitMs: number): string {
  return counted(Math.max(1, Math.ceil(waitMs / 1000)), "second", "seconds");
}

/**
 * `{running}`, `{waiting}` on the phone's sheets: a zero part is left out,
 * and "waiting for you" is the same for any number (G15).
 */
export function agentsAsOfText(running: number, waiting: number): string {
  const keepRunning = "If the computer is on, they keep running.";
  const needsYou = "Anything that needs you waits.";
  if (running > 0 && waiting > 0) {
    return `${running} running, ${waiting} waiting for you. ${keepRunning} ${needsYou}`;
  }
  if (running > 0) return `${running} running. ${keepRunning}`;
  if (waiting > 0) return `${waiting} waiting for you. ${needsYou}`;
  return "Nothing was running or waiting for you.";
}

/** A visible " · " is read as a comma in names and announcements: one helper does this. */
export function spoken(visible: string): string {
  return visible.replaceAll(" · ", ", ");
}

/**
 * A code read out character by character, grouped: "4F7 · 2KQ" →
 * "4, F, 7, 2, K, Q".
 */
export function spelled(code: string): string {
  return [...code.replaceAll(/[\s·]/g, "")].join(", ");
}
