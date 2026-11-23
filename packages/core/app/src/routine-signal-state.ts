// What the routine scheduler keeps of its signal starts between ticks, in one
// `Coordination` value per workspace: the signals it already decided not to
// start, and those queued (`overlap: queue`).

import { utf8Length } from "./routine-ids.ts";
import { MAX_QUEUED } from "./routine-overlap.ts";

/** A queued signal start: the signal's id (`<runId>:<seq>`) and when it was sent. */
export interface QueuedSignal {
  id: string;
  /** ISO time the signal was sent. */
  at: string;
}

/** The scheduler's signal starts as stored between ticks. */
export interface SignalState {
  /**
   * The run ids of signal starts that were skipped (overlap or loop guard),
   * with the time their signal was sent, so a signal two ticks see is
   * decided once. Started ones need no entry: their run exists.
   */
  decided: Record<string, string>;
  /** By routine key, oldest first. */
  queue: Record<string, QueuedSignal[]>;
}

/** The most UTF-8 bytes of the stored value: under the 64 KiB a `Coordination` value may hold. */
const maxStateBytes = 60_000;

/** A new empty state each time. */
export const noSignals = (): SignalState => ({ decided: {}, queue: {} });

/**
 * Reads what {@link writeSignalState} wrote. Only the scheduler writes the
 * key, so anything else counts as empty rather than stopping the routines:
 * a queued signal is then lost, as a queued time is.
 */
export function readSignalState(text: string | null): SignalState {
  if (text === null) return noSignals();
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !isRecord(parsed["decided"]) || !isRecord(parsed["queue"])) {
      return noSignals();
    }
    const decided: Record<string, string> = {};
    for (const [runId, at] of Object.entries(parsed["decided"])) {
      if (typeof at === "string") decided[runId] = at;
    }
    const queue: Record<string, QueuedSignal[]> = {};
    for (const [key, signals] of Object.entries(parsed["queue"])) {
      if (Array.isArray(signals)) queue[key] = signals.filter(isQueuedSignal);
    }
    return { decided, queue };
  } catch {
    return noSignals();
  }
}

/**
 * The state as kept in `Coordination`, or `null` when it holds nothing. Each
 * routine keeps at most {@link MAX_QUEUED} signals, and the newest go first
 * when the value would not fit.
 *
 * @returns the text to store and the queued signals that didn't fit, by routine key
 */
export function writeSignalState(state: SignalState): {
  text: string | null;
  dropped: { key: string; signal: QueuedSignal }[];
} {
  const dropped: { key: string; signal: QueuedSignal }[] = [];
  const queue: Record<string, QueuedSignal[]> = {};
  for (const [key, signals] of Object.entries(state.queue)) {
    if (signals.length === 0) continue;
    queue[key] = signals.slice(0, MAX_QUEUED);
    dropped.push(...signals.slice(MAX_QUEUED).map((signal) => ({ key, signal })));
  }
  const fitted = { decided: state.decided, queue };
  while (utf8Length(JSON.stringify(fitted)) > maxStateBytes) {
    if (!dropNewest(queue, dropped)) break;
  }
  const empty = Object.keys(fitted.decided).length === 0 && Object.keys(queue).length === 0;
  return { text: empty ? null : JSON.stringify(fitted), dropped };
}

function dropNewest(
  queue: Record<string, QueuedSignal[]>,
  dropped: { key: string; signal: QueuedSignal }[],
): boolean {
  let newest: { key: string; at: string } | null = null;
  for (const [key, signals] of Object.entries(queue)) {
    const last = signals.at(-1);
    if (last !== undefined && (newest === null || last.at > newest.at)) {
      newest = { key, at: last.at };
    }
  }
  if (newest === null) return false;
  const signals = queue[newest.key] ?? [];
  const signal = signals.pop();
  if (signal !== undefined) dropped.push({ key: newest.key, signal });
  if (signals.length === 0) delete queue[newest.key];
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQueuedSignal(value: unknown): value is QueuedSignal {
  return isRecord(value) && typeof value["id"] === "string" && typeof value["at"] === "string";
}
