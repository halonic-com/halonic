import type { RoutineTrigger } from "@halonicjs/format";
import { parseEvery } from "./parse-every.ts";

/**
 * How far back a mail check looks past the last check, so a message that
 * arrived while the last check was running is not missed. Message ids are
 * deduplicated by the caller.
 */
export const MAIL_OVERLAP_MS = 10 * 60_000;

/**
 * Whether it is time to look for new mail again: for a mail trigger, when it
 * was never checked or a full `every` has passed since the last check. Any
 * other trigger is never due this way.
 *
 * @throws {CronError} when the mail trigger's interval doesn't parse
 */
export function mailCheckDue(
  trigger: RoutineTrigger,
  lastChecked: Date | null,
  now: Date,
): boolean {
  if (!("mail" in trigger)) return false;
  return !lastChecked || now.getTime() - lastChecked.getTime() >= parseEvery(trigger.mail.every);
}

/**
 * The Gmail query for one mail check: the trigger's query plus `after:` the
 * last check minus {@link MAIL_OVERLAP_MS}, in whole seconds as Gmail wants.
 *
 * @throws {Error} when the trigger is not a mail trigger
 */
export function mailQuery(trigger: RoutineTrigger, since: Date): string {
  if (!("mail" in trigger)) throw new Error("not a mail trigger");
  const after = Math.floor((since.getTime() - MAIL_OVERLAP_MS) / 1000);
  return `${trigger.mail.query} after:${after}`;
}
