import type { RunEvent } from "@halonicjs/events";

/** The events that end a run (see `summarize`): nothing follows them. */
const endingEventTypes: ReadonlySet<string> = new Set([
  "run.completed",
  "run.failed",
  "run.cant-try",
]);

/** How many watchers one run object serves at once. A Studio watches the run on its screen, so this is generous. */
export const maxWatchers = 32;

/**
 * How many bytes may wait unread in one watcher's stream. A reader further behind than this is
 * closed with an error, and resumes from the last `seq` it saw, rather than holding the object's
 * memory.
 */
export const maxUnreadBytes = 4 * 1024 * 1024;

const encoder = new TextEncoder();

/** One event as a line of the watch stream: its JSON and a newline, as bytes. */
export function eventLine(event: RunEvent): Uint8Array {
  // JSON.stringify never writes a raw newline, so one event is always one line.
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

function byteLength(events: readonly RunEvent[]): number {
  return events.reduce((total, event) => total + eventLine(event).byteLength, 0);
}

/** Whether the event ends its run. */
export function isEndingEvent(event: RunEvent): boolean {
  return endingEventTypes.has(event.type);
}

/** One open stream: where it is written and the last `seq` it was given. */
interface Watcher {
  readonly controller: ReadableStreamDefaultController<Uint8Array>;
  lastSeq: number;
}

/**
 * The streams open on one run's log. A stream starts with the stored events after the `seq` the
 * client names, then gets each event {@link RunWatchers.publish} is given, until the run ends: the
 * stream then closes normally. A stream that breaks is errored, so its reader knows the run did not
 * end, and asks again from its last `seq`.
 *
 * A Durable Object runs one thing at a time between awaits, and `RunLog` reads and writes
 * synchronously, so opening a stream reads the stored events and registers the watcher without an
 * append in between. The watcher also drops any event not above the last `seq` it has, so a
 * repeat can't reach the client twice.
 */
export class RunWatchers {
  readonly #watchers = new Set<Watcher>();

  /**
   * Opens a stream of the events after `afterSeq`.
   *
   * @param stored - the events already stored after `afterSeq`, oldest first
   * @throws RangeError when the object already serves {@link maxWatchers} watchers
   */
  open(afterSeq: number, stored: readonly RunEvent[]): ReadableStream<Uint8Array> {
    if (this.#watchers.size >= maxWatchers) {
      throw new RangeError("This run has too many watchers. Try again in a moment.");
    }
    let watcher: Watcher | undefined;
    return new ReadableStream<Uint8Array>(
      {
        start: (controller) => {
          const opened: Watcher = { controller, lastSeq: afterSeq };
          if (!this.#give(opened, stored)) {
            watcher = opened;
            this.#watchers.add(opened);
          }
        },
        cancel: () => {
          if (watcher !== undefined) this.#watchers.delete(watcher);
        },
      },
      // The stored events are already in memory and are queued at once, so they get room of their
      // own: the limit is for the live events a reader leaves unread, not for a backlog it is about to read.
      new ByteLengthQueuingStrategy({ highWaterMark: maxUnreadBytes + byteLength(stored) }),
    );
  }

  /** Gives every open stream the events just stored. Call it right after the append, without an await between. */
  publish(events: readonly RunEvent[]): void {
    for (const watcher of this.#watchers) {
      if (watcher.controller.desiredSize !== null && watcher.controller.desiredSize <= 0) {
        this.#watchers.delete(watcher);
        watcher.controller.error(new Error("The reader fell too far behind the run's events."));
        continue;
      }
      if (this.#give(watcher, events)) this.#watchers.delete(watcher);
    }
  }

  /** How many streams are open. */
  get count(): number {
    return this.#watchers.size;
  }

  /**
   * Writes the events above the watcher's last `seq`, and closes its stream after an ending event.
   *
   * @returns whether the stream was closed
   */
  #give(watcher: Watcher, events: readonly RunEvent[]): boolean {
    for (const event of events) {
      if (event.seq <= watcher.lastSeq) continue;
      watcher.controller.enqueue(eventLine(event));
      watcher.lastSeq = event.seq;
      if (isEndingEvent(event)) {
        watcher.controller.close();
        return true;
      }
    }
    return false;
  }
}
