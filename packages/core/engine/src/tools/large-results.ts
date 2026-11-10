// A tool can answer with a whole export or a long document. The run log is
// read in full by every reader (timeline, summary, replays), so a result
// over 256 KB goes to the blob store and the log keeps its start and the
// blob's reference, as the port ADR plans for large payloads.

import type { BlobStore } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import type { TurnEvent, TurnLog } from "../agent/turn-log.ts";

/** The most bytes of UTF-8 a tool result may have and still be kept in the run log itself: 256 KB. */
export const maxLoggedResultBytes = 256 * 1024;

/** How many characters of a result kept in the blob store stay in the log, for readers of the log alone. */
export const resultStartLength = 2_000;

const resultMediaType = "text/plain";

/**
 * A {@link TurnLog} that keeps tool results over {@link maxLoggedResultBytes}
 * in the blob store (requirement `engine.large-results-to-blobs`). Such a
 * `tool.result` is written with the first {@link resultStartLength}
 * characters as `result` and the blob as `resultBlob`. Every other event
 * goes to the log as it is. The model still gets the whole result; only the
 * log keeps it apart.
 *
 * @example
 * const log = new LargeResultsTurnLog(new RunStoreTurnLog(runs, runId, lastSeq, clock), blobs);
 */
export class LargeResultsTurnLog implements TurnLog {
  readonly #log: TurnLog;
  readonly #blobs: Pick<BlobStore, "put">;

  constructor(log: TurnLog, blobs: Pick<BlobStore, "put">) {
    this.#log = log;
    this.#blobs = blobs;
  }

  /**
   * Appends the event, after storing a large result in the blob store.
   *
   * @throws when the blob or the event can't be stored; the turn stops there
   */
  async append(event: TurnEvent): Promise<void> {
    if (event.type !== "tool.result") {
      return this.#log.append(event);
    }
    const bytes = encodeUtf8(event.result);
    if (bytes.length <= maxLoggedResultBytes) {
      return this.#log.append(event);
    }
    const blob = await this.#blobs.put(bytes, resultMediaType);
    return this.#log.append({
      ...event,
      result: event.result.slice(0, resultStartLength),
      resultBlob: { hash: blob.hash, size: blob.size, mediaType: blob.mediaType },
    });
  }
}
