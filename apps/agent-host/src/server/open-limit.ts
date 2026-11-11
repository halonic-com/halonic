/**
 * Keeps a table of open things (sandbox sessions, bridges) under a limit,
 * counting those still opening: a place is reserved before something starts
 * to open, so things opening at the same time can't go past the limit together.
 */
export class OpenLimit {
  private readonly max: number;
  private readonly openCount: () => number;
  private reserved = 0;

  /**
   * @param max how many things may be open or opening at once
   * @param openCount how many are open now, read at each reservation
   */
  constructor(max: number, openCount: () => number) {
    this.max = max;
    this.openCount = openCount;
  }

  /**
   * Takes a place for one thing about to open. Call the returned function once
   * it is in the table, or failed to open; calling it twice frees one place only.
   *
   * @returns undefined when every place is taken
   */
  reserve(): (() => void) | undefined {
    if (this.openCount() + this.reserved >= this.max) return undefined;
    this.reserved += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.reserved -= 1;
    };
  }
}
