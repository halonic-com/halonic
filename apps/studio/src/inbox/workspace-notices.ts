import type { RunSummary } from "@halonicjs/events";
import {
  type FailedRunNotice,
  failedRunNotices,
  type InboxNotices,
} from "@halonicjs/studio-feature-inbox/api";

/** The part of `Storage` that remembers the dismissed notices. */
export interface DismissalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What {@link WorkspaceNotices} reads of the workspace's runs. */
export interface WorkspaceNoticesRuns {
  /** Every run of the workspace, real and test. */
  list(): Promise<readonly { readonly summary: RunSummary }[]>;
  /** The routine's name by the `trigger.routineId` of its runs; `undefined` when it is gone. */
  routine(key: string): { readonly name: string } | undefined;
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
    const nameOf = (routineId: string) => runs.routine(routineId)?.name ?? routineId;
    return failedRunNotices(summaries, nameOf, now()).filter(
      (notice) => !this.#dismissed.has(notice.key),
    );
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
    this.#dismissed.add(key);
    try {
      this.#parts.storage?.setItem(this.#key, JSON.stringify([...this.#dismissed]));
    } catch {
      // Kept for this session only.
    }
    for (const listener of [...this.#listeners]) listener();
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
