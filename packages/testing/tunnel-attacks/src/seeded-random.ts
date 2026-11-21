/** A source of numbers in [0, 1), the same sequence for the same seed. */
export type Rand = () => number;

/** A small seeded generator (mulberry32), so a failing fuzz run can be repeated from its seed. */
export function seededRandom(seed: number): Rand {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** One of `list`, picked by `rand`. */
export function pick<T>(rand: Rand, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)] as T;
}
