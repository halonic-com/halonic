// Small phrases the failure lines (`run-failures.ts`) share: a busy
// provider's tries, a harness by name, and waits in words.

import type { BusyRetries } from "@halonicjs/app/run-failure";
import { counted, timesInWords } from "./counts.ts";
import { harnessNames } from "./harness-names.ts";
import { type Phrase, phrase } from "./phrase.ts";

/**
 * "Anthropic was busy and asked Halonic to slow down.", then the tries, which
 * are named only when they happened (cli-output 3.4, revision 39).
 */
export function busyInWords(provider: string, retried: BusyRetries | undefined): Phrase {
  const busy = phrase`${provider} was busy and asked Halonic to slow down.`;
  if (retried === undefined) {
    return busy;
  }
  return phrase`${busy} Halonic tried ${timesInWords(retried.tries)} over ${minutesInWords(retried.overMs)}, then stopped.`;
}

/** A harness program by its name, such as "Claude Code", or else by its id. */
export function harnessName(id: string): string {
  return harnessNames.get(id) ?? id;
}

/** A wait in whole seconds, such as "60 seconds". */
export function secondsInWords(ms: number): string {
  return counted(Math.round(ms / 1000), "second", "seconds");
}

/** A wait in whole minutes, such as "5 minutes". */
export function minutesInWords(ms: number): string {
  return counted(Math.round(ms / 60_000), "minute", "minutes");
}
