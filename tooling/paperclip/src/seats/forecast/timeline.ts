/**
 * Records sorted by time, so a job can take the ones inside a span by binary
 * search. The nightly jobs ask for thousands of spans over a week of records;
 * scanning (and parsing) every record for each span took tens of seconds.
 */

/** Records ordered by a time in milliseconds, parsed once. */
export class Timeline<T> {
  private readonly times: readonly number[];
  private readonly items: readonly T[];

  /** Sorts `items` by `timeOf`, which is called once per item. */
  constructor(items: readonly T[], timeOf: (item: T) => number) {
    const timed = items
      .map((item) => ({ time: timeOf(item), item }))
      .sort((a, b) => a.time - b.time);
    this.times = timed.map((entry) => entry.time);
    this.items = timed.map((entry) => entry.item);
  }

  /** The records with a time after `fromMs` and at or before `toMs`, in time order. */
  between(fromMs: number, toMs: number): T[] {
    return this.items.slice(this.firstAfter(fromMs), this.firstAfter(toMs));
  }

  /** Whether any record has a time after `fromMs` and at or before `toMs`. */
  anyBetween(fromMs: number, toMs: number): boolean {
    return this.firstAfter(toMs) > this.firstAfter(fromMs);
  }

  /** The index of the first record whose time is after `ms`. */
  private firstAfter(ms: number): number {
    let low = 0;
    let high = this.times.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((this.times[middle] ?? Number.POSITIVE_INFINITY) <= ms) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }
}

/** Groups `items` by `keyOf`, keeping their order. */
export function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [item]);
    } else {
      group.push(item);
    }
  }
  return groups;
}
