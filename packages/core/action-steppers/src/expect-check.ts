/** One value that differs from what the requester saw. */
export interface ExpectChange {
  name: string;
  expected: string;
  /** What the `check` step read now, or `undefined` when the service no longer has it. */
  current: string | undefined;
}

/** The result of comparing a request's `expect` with the state a `check` step read. */
export type ExpectResult =
  | { ok: true }
  | { ok: false; changes: readonly ExpectChange[]; message: string };

/**
 * Compares the state the requester saw (the request's `expect`, such as a
 * pull request's head commit) with what a `check` step read just before the
 * run (architecture note, 6.2). Any difference stops the stepper with
 * "This changed since the request: …", naming each value. A value the check
 * read but the requester didn't name isn't compared.
 *
 * @example
 * checkExpect({ headSha: "abc1234" }, { headSha: "def5678" });
 * // => { ok: false, message: "This changed since the request: headSha was abc1234, is now def5678.", … }
 */
export function checkExpect(
  expected: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
): ExpectResult {
  const changes: ExpectChange[] = [];
  for (const [name, value] of Object.entries(expected)) {
    const now = Object.hasOwn(current, name) ? current[name] : undefined;
    if (now !== value) changes.push({ name, expected: value, current: now });
  }
  if (changes.length === 0) return { ok: true };
  return {
    ok: false,
    changes,
    message: `This changed since the request: ${changes.map(describeChange).join("; ")}.`,
  };
}

function describeChange(change: ExpectChange): string {
  if (change.current === undefined) return `${change.name} was ${change.expected}, is now gone`;
  return `${change.name} was ${change.expected}, is now ${change.current}`;
}
