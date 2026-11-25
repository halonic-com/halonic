import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { AllRunsRow } from "./source-rows.ts";

/** What the Runs app's list holds now: every source's rows, newest first, and the sources that failed. */
export interface AllRunsFeedState {
  readonly rows: readonly AllRunsRow[];
  /** A source whose last read failed; its rows from the read before stay in `rows`. */
  readonly failures: readonly {
    readonly source: { readonly id: string; readonly name: string };
    readonly error: unknown;
  }[];
  /** Whether every source has answered once. */
  readonly loaded: boolean;
  /** Why listing the sources failed, until it works again. */
  readonly error: unknown;
}

/** The runs of every workspace and team the Studio reads (`services.all-runs`). */
export interface AllRunsFeed {
  readonly state: AllRunsFeedState;
  /** Calls `listener` after each read; while anyone listens, the sources are read again and again. */
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
}

/**
 * The Runs app's runs, from every workspace and team. The app provides it
 * where an agent host serves the teams' runs; the Runs page then shows the
 * Runs app's list instead of the open workspace's own list.
 */
export const AllRunsService: ServiceKey<AllRunsFeed> = serviceKey<AllRunsFeed>("runs.all-runs");
