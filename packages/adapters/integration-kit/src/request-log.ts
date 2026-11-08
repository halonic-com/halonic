import type { RefusalCode } from "./refused.ts";

/**
 * One request an integration made. Method, host, path, status and time only:
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
}

/** The most recent requests of one integration, oldest first. */
export class RequestLog {
  readonly #entries: RequestLogEntry[] = [];
  readonly #limit: number;

  constructor(limit = 200) {
    this.#limit = limit;
  }

  add(entry: RequestLogEntry): void {
    this.#entries.push(entry);
    if (this.#entries.length > this.#limit) this.#entries.shift();
  }

  /** A copy of the entries, oldest first. */
  entries(): RequestLogEntry[] {
    return [...this.#entries];
  }
}
