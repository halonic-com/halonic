import type { RunSummary } from "@halonicjs/events";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import type { InboxRuns } from "@halonicjs/studio-feature-inbox/api";
import { unreachableWords } from "@halonicjs/studio-shell";
import { type PollTimer, runsPollInterval, systemTimer } from "./workspace-runs.ts";

/** The page's own `fetch`: same address, same session. */
export type PageFetch = (path: string, init?: RequestInit) => Promise<Response>;

/** What {@link ServedInboxRuns} needs. */
export interface ServedInboxRunsOptions {
  readonly fetch: PageFetch;
  /** Defaults to `setInterval`. */
  readonly timer?: PollTimer;
  /** Calls its listener when the window comes to the front; returns a function that stops it. */
  readonly onFocus?: (listener: () => void) => () => void;
  /** How long a request may take, in ms. Defaults to 15 s. */
  readonly timeoutMs?: number;
}

/** How long a request may take before it counts as not reached (a stalled mobile connection never answers). */
const requestTimeout = 15_000;

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
function refusal(status: number, doing: string, listing: boolean): KindedError {
  const kind = kindOfStatus(status);
  const why: Record<ErrorKind, string> = {
    invalid_input: `The computer didn't understand the request to ${doing}.`,
    unauthenticated: `Sign in again to ${doing}.`,
    denied: listing
      ? `The computer refused to ${doing}. This page may not be one it serves.`
      : `The computer refused to ${doing}. The workspace may not be trusted yet.`,
    not_found: listing
      ? `The computer doesn't offer that list, so Halonic couldn't ${doing}. It may be an older version.`
      : `That run is gone, so Halonic couldn't ${doing}.`,
    conflict: `The run doesn't take that answer now, so Halonic couldn't ${doing}. It may have moved on.`,
    limit_reached: `The computer has had too many requests just now, so Halonic couldn't ${doing}.`,
    unavailable: unreachableWords.reason(doing),
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
  options: ServedInboxRunsOptions,
  path: string,
  doing: string,
  listing: boolean,
  init?: RequestInit,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? requestTimeout);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await options.fetch(path, { ...init, signal });
  } catch (cause) {
    throw new KindedError("unavailable", unreachableWords.reason(doing), {
      cause,
    });
  }
  if (!response.ok) throw refusal(response.status, doing, listing);
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
  /** Whether a poll failed before any list was seen, so the next good one must tell the listeners. */
  #missed = false;
  #polling = false;
  #disposed = false;

  constructor(options: ServedInboxRunsOptions) {
    this.#options = options;
  }

  async waiting(): Promise<RunSummary[]> {
    const answer = await ask(this.#options, "/api/waiting-runs", "list what waits for you", true);
    const runs = (answer as { runs?: unknown } | null)?.runs;
    // One unreadable run rejects the whole list: the Inbox then shows "unavailable"
    // rather than a list with an item missing that someone is waiting on.
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
      this.#options,
      `/api/runs/${encodeURIComponent(runId)}/events`,
      "send your answer",
      false,
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
    // What waits now, so the first tick can tell a change.
    void this.#poll();
  }

  #stopWatching(): void {
    this.#stopPolling?.();
    this.#stopPolling = undefined;
    this.#seen = undefined;
    this.#missed = false;
  }

  async #poll(): Promise<void> {
    if (this.#polling) return;
    this.#polling = true;
    try {
      const runs = await this.waiting();
      const seen = runs.map((run) => `${run.id}@${run.lastSeq}`).join(" ");
      const changed = this.#missed || (this.#seen !== undefined && seen !== this.#seen);
      this.#seen = seen;
      this.#missed = false;
      if (changed) for (const listener of [...this.#listeners]) listener();
    } catch {
      // The next poll tries again; a list that fails shows where the Inbox loads.
      // With no list seen yet, whatever changed meanwhile is told after the next good one.
      if (this.#seen === undefined) this.#missed = true;
    } finally {
      this.#polling = false;
    }
  }
}
