/** What {@link orNothing}'s limit gives a part that hasn't answered in time. */
const overLimit: unique symbol = Symbol("over the limit");

/**
 * What a part gives once it has answered, or nothing when it fails or hasn't answered after
 * `limitMs`, said once on the console. The dialog then shows no wrong line, and a part that hangs
 * neither holds up the lines that don't need it nor keeps the dialog checking for ever.
 *
 * @example
 * const running = await orNothing("the engine", engine.answers(), 5_000);
 * if (running !== undefined) yield { check: "engine", running };
 */
export async function orNothing<T>(
  what: string,
  part: Promise<T>,
  limitMs: number,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<typeof overLimit>((resolve) => {
    timer = setTimeout(() => resolve(overLimit), limitMs);
  });
  // Past the limit, what the part throws has no line to go to; it was said on the console already.
  part.catch(() => undefined);
  try {
    const answer = await Promise.race([part, limit]);
    if (answer !== overLimit) return answer;
    console.error(`Check this computer gave up on ${what} after ${limitMs / 1000} seconds.`);
    return undefined;
  } catch (error) {
    console.error(`Check this computer couldn't read ${what}.`, error);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Each group's lines as soon as that group has answered, whichever answers first, until every
 * group has or `signal` aborts. The dialog puts the lines in their own order, so a slow group
 * holds back only its own lines. Every group must resolve: {@link orNothing} sees to that.
 */
export async function* asTheyAnswer<Line>(
  groups: readonly Promise<readonly Line[]>[],
  signal: AbortSignal,
): AsyncIterable<Line> {
  const waiting = new Map(
    groups.map((group, index) => [index, group.then((lines) => ({ index, lines }))]),
  );
  while (waiting.size > 0) {
    const { index, lines } = await Promise.race(waiting.values());
    waiting.delete(index);
    for (const line of lines) {
      if (signal.aborted) return;
      yield line;
    }
  }
}
