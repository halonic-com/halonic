import type { RunSummary } from "@halonicjs/events";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import type { InboxRuns } from "@halonicjs/studio-feature-inbox/api";
import { type PollTimer, runsPollInterval } from "./workspace-runs.ts";

/** The page's own `fetch`: same address, same session. */
export type PageFetch = (path: string, init?: RequestInit) => Promise<Response>;

/** What {@link ServedInboxRuns} needs. */
export interface ServedInboxRunsOptions {
  readonly fetch: PageFetch;
  /** Defaults to `setInterval`. */
  readonly timer?: PollTimer;
  /** Calls its listener when the window comes to the front; returns a function that stops it. */
  readonly onFocus?: (listener: () => void) => () => void;
}

const systemTimer: PollTimer = {
  every: (ms, tick) => {
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  },
};

/** How a refusal by the computer reads, by its HTTP status. */
function kindOfStatus(status: number): ErrorKind {
  switch (status) {
    case 400:
    case 415:
      return "invalid_input";
    case 401:
      return "unauthenticated";
    case 403:
      return "denied";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 429:
      return "limit_reached";
    default:
      return "unavailable";
  }
}

/** The sentence for a refusal. It is ours, never the body's text, so nothing from the wire is shown. */
function refusal(status: number, doing: string): KindedError {
  const kind = kindOfStatus(status);
  const why: Record<ErrorKind, string> = {
    invalid_input: `The computer didn't understand the request to ${doing}.`,
    unauthenticated: `Sign in again to ${doing}.`,
    denied: `The computer refused to ${doing}. The workspace may not be trusted yet.`,
    not_found: `That run is gone, so Halonic couldn't ${doing}.`,
    conflict: `The run doesn't take that answer now, so Halonic couldn't ${doing}. It may have moved on.`,
    limit_reached: `The computer has had too many requests today, so Halonic couldn't ${doing}.`,
    unavailable: `Halonic couldn't reach the computer to ${doing}.`,
    internal: `Halonic couldn't ${doing}.`,
  };
  return new KindedError(kind, why[kind]);
}

/** Whether `value` is a run summary the Inbox can read: it is what the Inbox reads first. */
function isWaitingSummary(value: unknown): value is RunSummary {
  if (typeof value !== "object" || value === null) return false;
  const run = value as { id?: unknown; status?: unknown; accepts?: unknown; approvals?: unknown };
  return (
    typeof run.id === "string" &&
    run.status === "waiting" &&
    Array.isArray(run.accepts) &&
    Array.isArray(run.approvals)
  );
}

async function ask(
  fetchPage: PageFetch,
  path: string,
  doing: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchPage(path, init);
  } catch (cause) {
    throw new KindedError("unavailable", `Halonic couldn't reach the computer to ${doing}.`, {
      cause,
    });
  }
  if (!response.ok) throw refusal(response.status, doing);
  try {
    return await response.json();
  } catch (cause) {
    throw new KindedError(
      "unavailable",
      `The computer's answer wasn't readable, so Halonic couldn't ${doing}.`,
      {
        cause,
      },
    );
  }
}

/**
 * The runs of the served workspace as the Inbox reads and answers them
 * (requirement `studio.served-inbox-runs`): it lists what waits with
 * `GET /api/waiting-runs` and sends approve, reject and wait answers with
 * `POST /api/runs/<id>/events`, both on the page's own address and session.
 *
 * While anyone listens, the list is read again every 10 s and when the window
 * comes to the front, and listeners hear only when the waiting runs changed.
 *
 * @example
 * services.provide(InboxRunsService, new ServedInboxRuns({ fetch: (path, init) => fetch(path, init) }));
 */
export class ServedInboxRuns implements InboxRuns {
  readonly #options: ServedInboxRunsOptions;
  readonly #listeners = new Set<() => void>();
  #stopPolling: (() => void) | undefined;
  /** The waiting runs' ids and last events as the last poll saw them; `undefined` before the first. */
  #seen: string | undefined;
  #polling = false;
  #disposed = false;

  constructor(options: ServedInboxRunsOptions) {
    this.#options = options;
  }

  async waiting(): Promise<RunSummary[]> {
    const answer = await ask(this.#options.fetch, "/api/waiting-runs", "list what waits for you");
    const runs = (answer as { runs?: unknown } | null)?.runs;
    if (!Array.isArray(runs) || !runs.every(isWaitingSummary)) {
      throw new KindedError(
        "unavailable",
        "The computer's list of waiting runs wasn't one Halonic could read.",
      );
    }
    return runs;
  }

  async send(
    runId: string,
    event: string,
    payload?: unknown,
    options?: { readonly callId?: string },
  ): Promise<RunSummary> {
    const body = {
      event,
      ...(payload === undefined ? {} : { payload }),
      ...(options?.callId === undefined ? {} : { callId: options.callId }),
    };
    const summary = await ask(
      this.#options.fetch,
      `/api/runs/${encodeURIComponent(runId)}/events`,
      "send your answer",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (
      typeof summary !== "object" ||
      summary === null ||
      (summary as { id?: unknown }).id !== runId
    ) {
      throw new KindedError("unavailable", "The computer's answer wasn't the run Halonic sent to.");
    }
    return summary as RunSummary;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    this.#startWatching();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#stopWatching();
    };
  }

  /** Stops reading the list. Disposing twice is fine. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#listeners.clear();
    this.#stopWatching();
  }

  #startWatching(): void {
    if (this.#stopPolling !== undefined || this.#disposed) return;
    const stopTimer = (this.#options.timer ?? systemTimer).every(
      runsPollInterval,
      () => void this.#poll(),
    );
    const stopFocus = this.#options.onFocus?.(() => void this.#poll()) ?? (() => {});
    this.#stopPolling = () => {
      stopTimer();
      stopFocus();
    };
  }

  #stopWatching(): void {
    this.#stopPolling?.();
    this.#stopPolling = undefined;
    this.#seen = undefined;
  }

  async #poll(): Promise<void> {
    if (this.#polling) return;
    this.#polling = true;
    try {
      const runs = await this.waiting();
      const seen = runs.map((run) => `${run.id}@${run.lastSeq}`).join(" ");
      const changed = this.#seen !== undefined && seen !== this.#seen;
      this.#seen = seen;
      if (changed) for (const listener of [...this.#listeners]) listener();
    } catch {
      // The next poll tries again; a list that fails shows where the Inbox loads.
    } finally {
      this.#polling = false;
    }
  }
}
