/**
 * Fixes the system clock and the random source for the whole process, for the
 * old CLI: it takes the time and its run IDs from the system, not from a
 * clock or ID generator we could pass in.
 *
 * - `Date` stands still at `at`: `Date.now()`, `new Date()` and `Date()` read
 *   that time; a date built from a value is left alone.
 * - The random source counts up: each `crypto.getRandomValues` call writes
 *   the next number (1, 2, 3, ...) into the last four bytes and zeros the rest;
 *   `crypto.randomUUID` and `Math.random` count up from the same counter.
 *
 * Old run IDs are `<prefix>_<time in base 36>_<4 random bytes in hex>`, so
 * with this they read, for example, `run_mjuohs00_00000003`.
 *
 * @returns a function that gives back the real clock and random source
 */
export function fixClockAndRandom(at: string): () => void {
  const fixed = Date.parse(at);
  if (Number.isNaN(fixed)) {
    throw new Error(`"${at}" is not a time to fix the clock at`);
  }
  const RealDate = Date;
  const crypto = globalThis.crypto;
  const real = {
    getRandomValues: crypto.getRandomValues,
    randomUUID: crypto.randomUUID,
    random: Math.random,
  };

  const FixedDate = function (this: unknown, ...args: unknown[]): Date | string {
    if (new.target === undefined) {
      return new RealDate(fixed).toString();
    }
    return args.length === 0
      ? new RealDate(fixed)
      : new RealDate(...(args as ConstructorParameters<DateConstructor>));
  } as unknown as DateConstructor;
  Object.setPrototypeOf(FixedDate, RealDate);
  Object.defineProperty(FixedDate, "prototype", { value: RealDate.prototype });
  Object.defineProperty(FixedDate, "now", { value: () => fixed });

  let counter = 0;
  const next = (): number => {
    counter += 1;
    return counter;
  };

  globalThis.Date = FixedDate;
  crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    const n = next();
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    bytes.fill(0);
    for (let i = 0; i < Math.min(4, bytes.length); i++) {
      bytes[bytes.length - 1 - i] = (n >>> (8 * i)) & 0xff;
    }
    return array;
  };
  crypto.randomUUID = () =>
    `00000000-0000-4000-8000-${next().toString(16).padStart(12, "0")}` as ReturnType<
      Crypto["randomUUID"]
    >;
  Math.random = () => (next() % 1_000_000) / 1_000_000;

  return () => {
    globalThis.Date = RealDate;
    crypto.getRandomValues = real.getRandomValues;
    crypto.randomUUID = real.randomUUID;
    Math.random = real.random;
  };
}
