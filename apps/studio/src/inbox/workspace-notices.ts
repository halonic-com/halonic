import type { RunSummary } from "@halonicjs/events";
import {
  type FailedRunNotice,
  failedRunNotices,
  type InboxNotices,
} from "@halonicjs/studio-feature-inbox/api";
import { type RoutineRunNames, routineRunName } from "./routine-run-name.ts";

/** The part of `Storage` that remembers the dismissed notices. */
export interface DismissalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What {@link WorkspaceNotices} reads of the workspace's runs. */
export interface WorkspaceNoticesRuns extends RoutineRunNames {
  /** Every run of the workspace, real and test. */
  list(): Promise<readonly { readonly summary: RunSummary }[]>;
  /** Calls `listener` whenever a run starts, changes or ends; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

/** What {@link WorkspaceNotices} needs. */
export interface WorkspaceNoticesParts {
  readonly runs: WorkspaceNoticesRuns;
  /** The window's storage; without it a dismissal lasts until the window closes. */
  readonly storage: DismissalStorage | undefined;
  /** The open workspace's folder, which keeps each workspace's dismissals apart. */
  readonly location: string;
  /** The time the notices are worded against ("at 06:00", "today"). */
  readonly now: () => Date;
}

/**
 * The Inbox's Notices for one open workspace (requirement `studio.inbox-notices`): the failed
 * routine runs in its run logs, as {@link failedRunNotices} makes them, without the ones you
 * dismissed. A dismissal is kept on this device as the notice's key and nothing else, so it
 * survives a restart and doesn't reach another device. Storage that can't be read or written
 * leaves the dismissals as they are in this session.
 *
 * @example
 * services.provide(InboxNoticesService, new WorkspaceNotices({ runs, storage, location, now }));
 */
export class WorkspaceNotices implements InboxNotices {
  readonly #parts: WorkspaceNoticesParts;
  readonly #key: string;
  readonly #listeners = new Set<() => void>();
  readonly #dismissed: Set<string>;

  constructor(parts: WorkspaceNoticesParts) {
    this.#parts = parts;
    this.#key = `halonic.inbox-dismissed-notices:${parts.location}`;
    this.#dismissed = new Set(this.#stored());
  }

  async list(): Promise<readonly FailedRunNotice[]> {
    const { runs, now } = this.#parts;
    const summaries = (await runs.list()).map((run) => run.summary);
    const nameOf = (_routineId: string, run: RunSummary) => routineRunName(runs, run);
    const notices = failedRunNotices(summaries, nameOf, now());
    this.#reload();
    this.#forget(new Set(notices.map((notice) => notice.key)));
    return notices.filter((notice) => !this.#dismissed.has(notice.key));
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    const stop = this.#parts.runs.subscribe(listener);
    return () => {
      this.#listeners.delete(listener);
      stop();
    };
  }

  dismiss(key: string): void {
    this.#reload();
    this.#dismissed.add(key);
    this.#save();
    for (const listener of [...this.#listeners]) listener();
  }

  /** Takes in what another window of the same workspace dismissed since this one read the list. */
  #reload(): void {
    for (const stored of this.#stored()) this.#dismissed.add(stored);
  }

  /** Drops the dismissals whose notice is gone, so the stored list doesn't grow for ever. */
  #forget(current: ReadonlySet<string>): void {
    const gone = [...this.#dismissed].filter((key) => !current.has(key));
    if (gone.length === 0) return;
    for (const key of gone) this.#dismissed.delete(key);
    this.#save();
  }

  #save(): void {
    try {
      this.#parts.storage?.setItem(this.#key, JSON.stringify([...this.#dismissed]));
    } catch {
      // Kept for this session only.
    }
  }

  #stored(): string[] {
    try {
      const parsed: unknown = JSON.parse(this.#parts.storage?.getItem(this.#key) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((one) => typeof one === "string") : [];
    } catch {
      return [];
    }
  }
}
