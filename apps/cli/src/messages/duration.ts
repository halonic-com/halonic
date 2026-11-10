const secondInMs = 1000;
const minuteInSeconds = 60;

/**
 * How long something took, as the output writes it (cli-output 1.5): whole
 * seconds under a minute, then minutes and seconds, or whole minutes when
 * the seconds are 0.
 *
 * @example
 * duration(18_400); // "18 s"
 * duration(347_000); // "5 min 47 s"
 * duration(360_000); // "6 min"
 */
export function duration(ms: number): string {
  const seconds = Math.round(Math.max(0, ms) / secondInMs);
  if (seconds < minuteInSeconds) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / minuteInSeconds);
  const rest = seconds % minuteInSeconds;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
