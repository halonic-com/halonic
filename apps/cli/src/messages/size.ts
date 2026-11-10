const units = ["KB", "MB", "GB", "TB"] as const;

/** Binary units, as the 1 GB low-disk line counts them (1 GB is 1024³ bytes). */
const step = 1024;

/**
 * A size as the output writes it: one decimal below 10, whole numbers from
 * 10, in the largest unit that keeps the number at 0.1 or more, so a nearly
 * full disk reads "0.8 GB free" as the approved line does.
 *
 * @param bytes - a size of zero or more bytes
 * @example
 * shownSize(51_539_607_552); // "48 GB"
 * shownSize(1_503_238_553); // "1.4 GB"
 * shownSize(858_993_459); // "0.8 GB"
 * shownSize(5_242_880); // "5.0 MB"
 */
export function shownSize(bytes: number): string {
  let value = bytes / step;
  let unit = 0;
  while (unit < units.length - 1 && value / step >= 0.1) {
    value /= step;
    unit += 1;
  }
  if (value === 0) return `0 ${units[unit]}`;
  const number = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${number} ${units[unit]}`;
}
