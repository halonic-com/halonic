import { checkTimeZone, describeCron } from "@halonicjs/routines";

/** What the engine makes of a cron line: the line in words, or why it can't be used. */
export type CronCheck =
  | { readonly valid: true; readonly words: string }
  | { readonly valid: false; readonly error: string };

/** The engine's own words for `cron`; its error messages are written to be shown as they are. */
export function checkCron(cron: string): CronCheck {
  try {
    return { valid: true, words: describeCron(cron.trim()) };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The engine's message for a time zone it doesn't know; `undefined` for a known zone or none. */
export function timeZoneError(timeZone: string | undefined): string | undefined {
  if (timeZone === undefined) return undefined;
  try {
    checkTimeZone(timeZone);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** The zones to pick from: the device's first, then every zone the runtime knows, then `current` if it is neither. */
export function zoneChoices(device: string | undefined, current: string | undefined): string[] {
  const known = Intl.supportedValuesOf("timeZone");
  const zones = new Set<string>(device === undefined ? [] : [device]);
  for (const zone of known) zones.add(zone);
  if (current !== undefined) zones.add(current);
  return [...zones];
}
