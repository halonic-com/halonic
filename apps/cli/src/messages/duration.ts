const secondInMs = 1000;
const minuteInSeconds = 60;

/**
 * How long something took, as the output writes it (cli-output 1.5): whole
 * seconds under a minute, then minutes and seconds, or whole minutes when
 * the seconds are 0.
 *
 * Two details 1.5 leaves open, decided on HAL-2816: the time is rounded down
 * to whole seconds, as the progress line does, and anything under a second
 * reads "1 s", so nothing ever "took 0 s". There are no hours: a long run
 * reads "75 min".
 *
 * @example
 * duration(18_900); // "18 s"
 * duration(347_000); // "5 min 47 s"
 * duration(360_000); // "6 min"
 * duration(400); // "1 s"
 */
export function duration(ms: number): string {
  const seconds = Math.max(1, Math.floor(ms / secondInMs));
  if (seconds < minuteInSeconds) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / minuteInSeconds);
  const rest = seconds % minuteInSeconds;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
