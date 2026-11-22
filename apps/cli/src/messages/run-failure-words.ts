// Small phrases the failure lines (`run-failures.ts`) share: a busy
// provider's tries, a harness by name, waits in words, and the names and
// fixes several reasons repeat.

import { secretVariableName } from "@halonicjs/adapter-env-secrets";
import { type BusyRetries, isModelAlias, type RunFailure } from "@halonicjs/app/run-failure";
import { counted, listInWords, timesInWords } from "./counts.ts";
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

/** Why the step can't go on from the event it ended with. */
export function noTransitionReason(
  failure: Extract<RunFailure, { reason: "no-transition" }>,
): Phrase {
  if (failure.guarded) {
    return phrase`its transitions for ${failure.event} all have a when that didn't pass.`;
  }
  return failure.takes.length === 0
    ? phrase`it ended with the event ${failure.event}, and it has no transition.`
    : phrase`it ended with the event ${failure.event}, but its transitions only take ${listInWords(failure.takes, "or")}.`;
}

/** "the model alias smart", or "the model mok/echo" for an agent's shorthand. */
export function modelNamed(failure: Extract<RunFailure, { reason: "unknown-provider" }>): Phrase {
  return "alias" in failure
    ? phrase`the model alias ${failure.alias}`
    : phrase`the model ${failure.model}`;
}

/** The path of items that are one placeholder and nothing else, such as "input.topics". */
export function placeholderPath(items: string): string | undefined {
  return /^\{\{\s*([^{}\s]+)\s*\}\}$/.exec(items.trim())?.[1];
}

/** "a text", "an object", "a number". */
export function aKind(kind: string): string {
  return kind === "object" ? "an object" : `a ${kind}`;
}

/**
 * A key's fix names `halonic secret set` first, as the CLI's own way to save
 * one, and the variable as the other (HAL-12570).
 */
export function saveKey(key: Phrase, secret: string): Phrase {
  return phrase`Save ${key} with halonic secret set ${secret}, or set ${secretVariableName(secret)}, then run again.`;
}

/** Every key error names the secret and the variable Halonic reads it from, the same as the reader does. */
export function namedSecret(secret: string): string {
  return `${secret} (${secretVariableName(secret)})`;
}

/** "the model alias smart", or "the model gpt-4.1" when no alias points at the model (C457-1). */
export function modelOrAlias(failure: { readonly model: string; readonly alias: string }): Phrase {
  return isModelAlias(failure.alias)
    ? phrase`the model alias ${failure.alias}`
    : phrase`the model ${failure.model}`;
}

/** `provider-busy`, `model-timeout` and `tool-timeout`: nothing the user set caused it. */
export function tryLater(): Phrase {
  return phrase`Run it again in a few minutes.`;
}
