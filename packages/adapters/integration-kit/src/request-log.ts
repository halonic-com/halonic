import type { RefusalCode } from "./integration/index.ts";

/**
 * One request an integration made. Method, host, path, status, time and retry only:
 * no query, no headers and no bodies, so the log never holds a secret or the
 * content of a message. The integration debugger reads only this.
 */
export interface RequestLogEntry {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  /** The final status, after redirects. Absent when no response came. */
  readonly status?: number;
  readonly durationMs: number;
  readonly outcome: "ok" | "refused" | "failed";
  /** Why the kit refused it, when it did. */
  readonly refusal?: RefusalCode;
  /** Which retry of the same request this is, after a `429`. Absent on the first attempt. */
  readonly retry?: 1 | 2;
}

/** The most recent requests of one integration, oldest first. */
export class RequestLog {
  readonly #entries: RequestLogEntry[] = [];
  readonly #limit: number;
  readonly #listeners = new Set<(entry: RequestLogEntry) => void>();

  constructor(limit = 200) {
    this.#limit = limit;
  }

  add(entry: RequestLogEntry): void {
    this.#entries.push(entry);
    if (this.#entries.length > this.#limit) this.#entries.shift();
    for (const listener of this.#listeners) {
      try {
        listener(entry);
      } catch {
        // A listener only reads; its failure never fails the request.
      }
    }
  }

  /**
   * Calls `listener` with each entry as it is added, until the returned
   * function is called: how Halonic's local request log store keeps them.
   */
  onEntry(listener: (entry: RequestLogEntry) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** A copy of the entries, oldest first. */
  entries(): RequestLogEntry[] {
    return [...this.#entries];
  }
}
