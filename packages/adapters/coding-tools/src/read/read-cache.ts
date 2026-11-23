// The read cache (A1 in the HAL-16737 plan). A cheap model re-reads
// overlapping ranges of the same file; each re-read costs the lines again.
// The server remembers which lines of each file it already sent, and as
// long as the file hasn't changed, sends only the lines not sent yet.

/** An inclusive range of line numbers, from 1. */
export interface LineSpan {
  readonly start: number;
  readonly end: number;
}

/** What to do with a requested range: the parts to send, and the parts sent before. */
export interface ReadPlan {
  readonly send: readonly LineSpan[];
  readonly sentBefore: readonly LineSpan[];
}

/** What the cache knows of one file. */
interface FileMemory {
  digest: string;
  /** The lines sent, sorted and merged. */
  sent: LineSpan[];
}

/**
 * The lines each file has sent in this session (requirement
 * `coding-tools.read-ranges`). It lives in the server's memory, one per
 * session, and only {@link ReadCache.markSent} adds to it, so a line counts
 * as sent only once it really was.
 */
export class ReadCache {
  readonly #files = new Map<string, FileMemory>();

  /**
   * Which parts of `wanted` to send. Everything when the file is new to the
   * cache, its digest changed, or `fresh` is asked for; otherwise only the
   * lines not sent before.
   */
  plan(file: string, digest: string, wanted: LineSpan, fresh: boolean): ReadPlan {
    const memory = this.#files.get(file);
    if (fresh || memory === undefined || memory.digest !== digest) {
      return { send: [wanted], sentBefore: [] };
    }
    return {
      send: spansMissing(memory.sent, wanted),
      sentBefore: spansCovered(memory.sent, wanted),
    };
  }

  /** Remembers that `span` of the file, with this digest, was sent. A new digest forgets the old lines. */
  markSent(file: string, digest: string, span: LineSpan): void {
    const memory = this.#files.get(file);
    if (memory === undefined || memory.digest !== digest) {
      this.#files.set(file, { digest, sent: [span] });
      return;
    }
    memory.sent = merged([...memory.sent, span]);
  }
}

/** The parts of `wanted` that no span in `sent` covers. `sent` is sorted and merged. */
function spansMissing(sent: readonly LineSpan[], wanted: LineSpan): LineSpan[] {
  const missing: LineSpan[] = [];
  let next = wanted.start;
  for (const span of sent) {
    if (span.end < next) continue;
    if (span.start > wanted.end) break;
    if (span.start > next) missing.push({ start: next, end: span.start - 1 });
    next = span.end + 1;
  }
  if (next <= wanted.end) missing.push({ start: next, end: wanted.end });
  return missing;
}

/** The parts of `wanted` that spans in `sent` cover. */
function spansCovered(sent: readonly LineSpan[], wanted: LineSpan): LineSpan[] {
  return sent
    .filter((span) => span.end >= wanted.start && span.start <= wanted.end)
    .map((span) => ({
      start: Math.max(span.start, wanted.start),
      end: Math.min(span.end, wanted.end),
    }));
}

/** The spans sorted, with touching or overlapping ones joined. */
function merged(spans: readonly LineSpan[]): LineSpan[] {
  const sorted = spans.toSorted((a, b) => a.start - b.start);
  const joined: LineSpan[] = [];
  for (const span of sorted) {
    const last = joined.at(-1);
    if (last !== undefined && span.start <= last.end + 1) {
      joined[joined.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    } else {
      joined.push(span);
    }
  }
  return joined;
}
