import type { FailedRunNotice } from "./failed-run-notices.ts";

/**
 * The notices the Inbox shows under Needs you. The app provides them for each open workspace: it
 * reads the run summaries, makes the notices ({@link failedRunNotices}) and keeps your dismissals
 * on this device, as the notice's key and nothing else.
 */
export interface InboxNotices {
  /** The notices to show now, newest first, without the dismissed ones. Rejects with the reason it couldn't read them. */
  list(): Promise<readonly FailedRunNotice[]>;
  /** Calls `listener` whenever the notices may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
  /** Hides the notice with this key, and calls the listeners. */
  dismiss(key: string): void;
}
