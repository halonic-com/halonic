const secondInMs = 1000;
const minuteInSeconds = 60;
const hourInMinutes = 60;
const dayInHours = 24;
/** From 48 hours on, a time reads in days and hours. */
const daysFromHours = 48;

/**
 * How long something took, as the output writes it (cli-output 1.5): whole
 * seconds under a minute, then minutes and seconds, or whole minutes when
 * the seconds are 0.
 *
 * Two details 1.5 leaves open, decided on HAL-2816: the time is rounded down
 * to whole seconds, as the progress line does, and anything under a second
 * reads "1 s", so nothing ever "took 0 s". From an hour on, it is hours and
 * minutes, and from 48 hours days and hours, each rounded down, so a run that
 * waited a day and a half for a person doesn't read "2158 min 32 s"
 * (HAL-13919).
 *
 * @example
 * duration(18_900); // "18 s"
 * duration(347_000); // "5 min 47 s"
 * duration(360_000); // "6 min"
 * duration(400); // "1 s"
 * duration(129_752_000); // "36 h 2 min"
 * duration(187_200_000); // "2 days 4 h"
 */
export function duration(ms: number): string {
  const seconds = Math.max(1, Math.floor(ms / secondInMs));
  if (seconds < minuteInSeconds) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / minuteInSeconds);
  if (minutes < hourInMinutes) {
    return withRest(`${minutes} min`, seconds % minuteInSeconds, "s");
  }
  const hours = Math.floor(minutes / hourInMinutes);
  if (hours < daysFromHours) {
    return withRest(`${hours} h`, minutes % hourInMinutes, "min");
  }
  return withRest(`${Math.floor(hours / dayInHours)} days`, hours % dayInHours, "h");
}

/** The larger unit, then the rest in the smaller one unless it is 0. */
function withRest(larger: string, rest: number, unit: string): string {
  return rest === 0 ? larger : `${larger} ${rest} ${unit}`;
}
