import type { FailedRunNotice } from "./failed-run-notices.ts";

/**
 * The notice that says the sandbox is ready again, after a check passed and its Inbox row has
 * been seen as Fixed (requirement `inbox.sandbox-row`). It has no run to open and keeps its ×. It
 * lives in memory only: it is gone on the next load.
 */
export interface SandboxFixedNotice {
  readonly kind: "sandbox-fixed";
  /** `sandbox-fixed:<time>`. Holds nothing but the time of the passing check. */
  readonly key: string;
  /** ISO time the check passed. */
  readonly at: string;
  /** The sentence the row shows. */
  readonly title: string;
}

/** A row of the Inbox's Notices. */
export type InboxNotice = FailedRunNotice | SandboxFixedNotice;

/**
 * The notices the Inbox shows under Needs you. The app provides them for each open workspace: it
 * reads the run summaries, makes the notices ({@link failedRunNotices}) and keeps your dismissals
 * on this device, as the notice's key and nothing else.
 */
export interface InboxNotices {
  /** The notices to show now, newest first, without the dismissed ones. Rejects with the reason it couldn't read them. */
  list(): Promise<readonly InboxNotice[]>;
  /** Calls `listener` whenever the notices may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
  /** Hides the notice with this key, and calls the listeners. */
  dismiss(key: string): void;
}
