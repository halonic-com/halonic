/**
 * Whether the source's live events reach the engine: `connected`, or `down`, which also covers a
 * source that doesn't allow them. Until the events connection exists, every source is `down`.
 */
export type EventsState = "connected" | "down";

/** How long the sync waits between two polls, in milliseconds, by events state and window. */
export interface PollRates {
  /** With events connected a poll is only a safety net, so it comes seldom. */
  connected: { windowOpenMs: number; windowClosedMs: number };
  /** Without events the poll is how changes arrive, so it comes often while a window is open. */
  down: { windowOpenMs: number; windowClosedMs: number };
  /** While a window is open and a chat the person sent to waits for its agent, at most this long. */
  whileWaitingMs: number;
  /** How long after the person's last send a waiting chat may make the sync poll that often. */
  waitingForMs: number;
}

/**
 * Every poll rate of the sync, in one table so the counters can tune it (requirement
 * `agent-host.paperclip-polling`, design HAL-19201). A no-change poll is one small "changed since"
 * read, so 10 seconds without events is affordable.
 */
export const pollRates: PollRates = {
  connected: { windowOpenMs: 60_000, windowClosedMs: 5 * 60_000 },
  down: { windowOpenMs: 10_000, windowClosedMs: 2 * 60_000 },
  whileWaitingMs: 5_000,
  waitingForMs: 3 * 60_000,
};
