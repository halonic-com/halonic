import type { ActionKeptValue, ActionParameterValue } from "@halonicjs/events";

/** The longest value name the stop message quotes; a longer one is cut and ends with `…`. */
const maxQuotedNameLength = 40;

/** One value that differs from what the requester saw. */
export interface ExpectChange {
  name: string;
  expected: ActionParameterValue;
  /** What the `check` step read now, or `undefined` when the service no longer has it. */
  current: ActionKeptValue | undefined;
}

/** The result of comparing a request's `expect` with the state a `check` step read. */
export type ExpectResult =
  | { ok: true }
  | { ok: false; changes: readonly ExpectChange[]; message: string };

/**
 * Compares the state the requester saw (the request's `expect`, such as a
 * pull request's head commit) with what a `check` step kept just before the
 * run (architecture note, 6.2). Values compare with `===`, so `1` and `"1"`
 * differ. Any difference stops the stepper with "This changed since the
 * request: …". The message quotes only the changed values' names, cut short:
 * the values come from the requester and the service, so they stay out of
 * Halonic's own sentence and the screen shows them from `changes` as data. A
 * value the check kept but the requester didn't name isn't compared.
 *
 * @example
 * checkExpect({ headSha: "abc1234" }, { headSha: "def5678" });
 * // => { ok: false, message: 'This changed since the request: "headSha".', … }
 */
export function checkExpect(
  expected: Readonly<Record<string, ActionParameterValue>>,
  current: Readonly<Record<string, ActionKeptValue>>,
): ExpectResult {
  const changes: ExpectChange[] = [];
  for (const [name, value] of Object.entries(expected)) {
    const now = Object.hasOwn(current, name) ? current[name] : undefined;
    if (now !== value) changes.push({ name, expected: value, current: now });
  }
  if (changes.length === 0) return { ok: true };
  const names = changes.map((change) => quoteName(change.name)).join(", ");
  return { ok: false, changes, message: `This changed since the request: ${names}.` };
}

/** Quotes a name, cut by code point so a cut never leaves half of a surrogate pair. */
function quoteName(name: string): string {
  const characters = [...name];
  if (characters.length <= maxQuotedNameLength) return `"${name}"`;
  return `"${characters.slice(0, maxQuotedNameLength - 1).join("")}…"`;
}
