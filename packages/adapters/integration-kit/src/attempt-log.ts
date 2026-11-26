import { IntegrationRefusedError } from "./integration/index.ts";
import type { RequestLog, RequestLogEntry } from "./request-log.ts";
import { SecretInRequestError } from "./secret-in-request.ts";

/** What the log shows of a request: its method, host and path. */
type Place = Pick<RequestLogEntry, "method" | "host" | "path">;

/** What the log shows of a request that failed before the secret check passed. */
const unchecked: Place = { method: "", host: "", path: "" };

/**
 * The log entries of one `fetch`: one for each request sent, so a request
 * the kit retries gets an entry for each attempt, the retries marked
 * `retry: 1` and `retry: 2`. Each attempt is timed on its own.
 */
export class AttemptLog {
  readonly #log: RequestLog;
  readonly #now: () => number;
  #started: number;
  #retry = 0;
  /** Whether an attempt is under way and not logged yet. */
  #open = true;
  /** Until the secret check has passed, the method, host and path may hold a key. */
  #place = unchecked;

  constructor(log: RequestLog, now: () => number) {
    this.#log = log;
    this.#now = now;
    this.#started = now();
  }

  /** The secret check has passed: from here on the log may show the request's place. */
  checked(method: string, url: string | undefined): void {
    this.#place = { method, ...logPlace(url) };
  }

  /** Logs the answer of the current attempt, at the URL of the hop that gave it. */
  answered(status: number, url: URL): void {
    this.#add({
      method: this.#place.method,
      ...logPlace(url),
      status,
      outcome: "ok",
    });
  }

  /** Starts the next attempt, a retry. */
  retrying(): void {
    this.#retry++;
    this.#started = this.#now();
    this.#open = true;
  }

  /**
   * Logs the error that ended the current attempt. Nothing when no attempt
   * is under way: an abort during the wait before a retry sent nothing.
   */
  failed(error: unknown): void {
    if (!this.#open) return;
    const refused = error instanceof IntegrationRefusedError;
    this.#add({
      ...(error instanceof SecretInRequestError ? error.logged : this.#place),
      outcome: refused ? "refused" : "failed",
      ...(refused ? { refusal: error.code } : {}),
    });
  }

  #add(entry: Omit<RequestLogEntry, "durationMs" | "retry">): void {
    this.#open = false;
    this.#log.add({
      ...entry,
      durationMs: this.#now() - this.#started,
      ...(this.#retry > 0 ? { retry: this.#retry as 1 | 2 } : {}),
    });
  }
}

/** Host and path for the log, without query or fragment. Empty when the URL doesn't parse. */
function logPlace(raw: unknown): { host: string; path: string } {
  try {
    const url = new URL(String(raw));
    return { host: url.host, path: url.pathname };
  } catch {
    return { host: "", path: "" };
  }
}
