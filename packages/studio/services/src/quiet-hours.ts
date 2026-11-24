import type { AgentNotice, Notifier } from "./agent-notifications.ts";

/**
 * Quiet hours as set in Settings: minutes after local midnight, `start`
 * included and `end` not. When `start` is after `end` they run past midnight,
 * as in 22:00 to 07:00.
 */
export interface QuietHours {
  startMinute: number;
  endMinute: number;
}

/** What {@link QuietHoursNotifier} needs besides the notifier it holds back. */
export interface QuietHoursOptions {
  /** The quiet hours set now, or `undefined` when none are set. Read on every notice. */
  quietHours(): QuietHours | undefined;
  /** Hears a summary the system refused. */
  onError(error: unknown): void;
}

const minutesPerDay = 24 * 60;
const millisecondsPerMinute = 60_000;

/**
 * Holds notifications back during quiet hours (requirement
 * `services.agent-quiet-hours`). A notice that comes in during them shows
 * nothing; when they end, one summary counts what came in, such as "3 new".
 * Outside quiet hours every notice shows at once.
 *
 * It uses the page's clock and timers, so tests drive it with a fake clock.
 * Call `stop` when Studio closes the watch, so no summary waits behind it.
 */
export class QuietHoursNotifier implements Notifier {
  readonly #inner: Notifier;
  readonly #options: QuietHoursOptions;
  #held = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(inner: Notifier, options: QuietHoursOptions) {
    this.#inner = inner;
    this.#options = options;
  }

  show(notice: AgentNotice, onClick: () => void): Promise<void> {
    const quietHours = this.#options.quietHours();
    const now = new Date();
    if (quietHours === undefined || !isQuiet(quietHours, now)) {
      return this.#inner.show(notice, onClick);
    }
    this.#held += 1;
    this.#timer ??= setTimeout(() => this.#summarize(), millisecondsUntilEnd(quietHours, now));
    return Promise.resolve();
  }

  /** Drops what is held and the summary waiting for it. */
  stop(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#held = 0;
  }

  #summarize(): void {
    const count = this.#held;
    this.stop();
    const summary: AgentNotice = {
      reason: "summary",
      title: `${count} new`,
      body: "",
      target: { kind: "inbox", id: "" },
    };
    // A summary opens nothing in particular: the system's default brings Studio up.
    this.#inner.show(summary, () => undefined).catch(this.#options.onError);
  }
}

function minuteOfDay(time: Date): number {
  return time.getHours() * 60 + time.getMinutes();
}

/** Whether `time` falls inside the quiet hours, also when they run past midnight. */
export function isQuiet(quietHours: QuietHours, time: Date): boolean {
  const { startMinute, endMinute } = quietHours;
  const minute = minuteOfDay(time);
  if (startMinute === endMinute) return false;
  if (startMinute < endMinute) return minute >= startMinute && minute < endMinute;
  return minute >= startMinute || minute < endMinute;
}

function millisecondsUntilEnd(quietHours: QuietHours, now: Date): number {
  const minutesLeft = (quietHours.endMinute - minuteOfDay(now) + minutesPerDay) % minutesPerDay;
  const intoMinute = now.getSeconds() * 1000 + now.getMilliseconds();
  return minutesLeft * millisecondsPerMinute - intoMinute;
}
