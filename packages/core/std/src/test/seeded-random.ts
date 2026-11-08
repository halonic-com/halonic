/**
 * A small seeded generator (xorshift32) for tests, so generated inputs are
 * the same on every run and a failure can be repeated.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  /** The next 32-bit unsigned number. */
  nextWord(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  /** A whole number from 0 up to, but not including, `limit`. */
  below(limit: number): number {
    return this.nextWord() % limit;
  }

  /** `count` random bytes. */
  bytes(count: number): Uint8Array {
    const bytes = new Uint8Array(count);
    for (let index = 0; index < count; index++) {
      bytes[index] = this.below(256);
    }
    return bytes;
  }
}
