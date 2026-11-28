import type { SyncConnection, SyncSource, SyncTiming } from "@halonicjs/ports";

// Every string Settings › Sync diagnostics shows, for its design check on HAL-19337.

/** Settings › Sync diagnostics: the section's title in the list. */
export const SECTION_TITLE = "Sync diagnostics";
/** The line under the title. */
export const SECTION_LINE =
  "How the Inbox and Messenger stay up to date with Paperclip, over the last 24 hours.";

/** Whether live updates reach this computer now. */
export const CONNECTION: Record<SyncConnection, string> = {
  connected: "Live updates are on.",
  "polling-only": "Live updates are off, so Halonic checks Paperclip for changes regularly.",
  "not-allowed": "Paperclip doesn't allow live updates, so Halonic checks for changes regularly.",
};

/** The heading over how changes arrived. */
export const ARRIVED = "How changes arrived";
/** One row per way a change arrives. */
export const SOURCES: Record<SyncSource, string> = {
  event: "Live updates",
  poll: "Regular checks",
  "catch-up": "Catch-up after a start",
  write: "Your own changes",
};

/** The heading over the delays and counts. */
export const TIMING = "Delays and connection";
export const POLL_DELAY = "Delay of regular checks";
export const EVENT_DELAY = "Delay of live updates";
export const MISSED = "Missed by live updates, caught by a check";
export const RECONNECTS = "Live updates reconnected";
/** How long the engine spent in each connection. */
export const TIME_IN: Record<SyncConnection, string> = {
  connected: "Time with live updates",
  "polling-only": "Time checking only",
  "not-allowed": "Time live updates weren't allowed",
};

/** The heading and columns of the Paperclip calls. */
export const CALLS = "Paperclip calls";
export const CALL_COLUMNS = ["Route", "Calls", "Failed", "Typical", "Slowest 5%", "Data"] as const;
export const NO_CALLS = "No calls to Paperclip yet.";

export const READ_AGAIN = "Read again";
/** Read again and Try again while a read runs. */
export const READING = "Reading…";
export const READ_FAILED = "Sync diagnostics couldn't be read.";
export const TRY_AGAIN = "Try again";

/** A count with its share, such as "3 (75%)". */
export function countLine(count: number, share: number): string {
  return `${count} (${Math.round(share * 100)}%)`;
}

/** A time in milliseconds, such as "320 ms" or "1.2 s". */
export function msText(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")} s`;
}

/**
 * A delay's typical and slowest time, such as "1.2 s typical, 4 s for the slowest 5%", or
 * "None yet".
 */
export function delayLine(timing: SyncTiming): string {
  if (timing.p50Ms === null || timing.p95Ms === null) return "None yet";
  return `${msText(timing.p50Ms)} typical, ${msText(timing.p95Ms)} for the slowest 5%`;
}

/**
 * When the counters cover less than the 24 hours the section's line names, because Halonic
 * started since: "Counted since Halonic started, 2 h 12 min ago."
 */
export function countedSince(windowMs: number): string {
  return `Counted since Halonic started, ${spanText(windowMs)} ago.`;
}

/** A long stretch of time, such as "3 h 12 min", "45 min", "under 1 min" or, for none, "0 min". */
export function spanText(ms: number): string {
  // "under 1 min" would say it happened; most of these times are zero.
  if (ms <= 0) return "0 min";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under 1 min";
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
