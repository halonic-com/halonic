import type { Message } from "../messages/define.ts";
import type { Phrase } from "../messages/phrase.ts";
import { progressMessages } from "../messages/progress.ts";

/** How long a step runs before its live line shows (cli-output 1.5): a faster step only flickers. */
export const showAfterMs = 1_000;

/** How long a wait lasts before the live line says what it's waiting for (cli-output 1.5). */
export const sayWaitingAfterMs = 10_000;

/** The time and a repeating timer, passed in so a test can move time on by hand. */
export interface Clock {
  /** Milliseconds since some fixed point, as `Date.now()`. */
  now(): number;
  /** Calls `tick` every `ms` milliseconds until the returned function is called. */
  every(ms: number, tick: () => void): () => void;
}

/** The computer's own clock. */
export const systemClock: Clock = {
  now: () => Date.now(),
  every(ms, tick) {
    const timer = setInterval(tick, ms);
    return () => clearInterval(timer);
  },
};

/** The one line at the bottom of a terminal that a step can draw over and over, and take away. */
export interface LiveLine {
  /** Shows `message` in place of what the line showed before. */
  draw(message: Message): void;
  /** Takes the line away, so the next line is written where it was. */
  clear(): void;
}

// Carriage return, then "erase the whole line": the cursor is back at the start of an empty line.
const eraseLine = "\r\u001b[2K";

/**
 * The {@link LiveLine} of a terminal stream: each draw replaces the line by
 * going back to its start, so it writes no newline. Only for a stream whose
 * style has live lines on; a pipe would keep every drawn line.
 *
 * @param write - writes text to the stream as it is, without adding a newline
 * @param render - the message in the stream's colours and marks
 */
export function terminalLine(
  write: (text: string) => void,
  render: (message: Message) => string,
): LiveLine {
  return {
    draw: (message) => write(`${eraseLine}${render(message)}`),
    clear: () => write(eraseLine),
  };
}

/** The live line of one step, from {@link startProgress}. */
export interface Progress {
  /**
   * Says what the step is waiting for now, such as "Anthropic", or
   * `undefined` when news came in. The line names it once the wait has
   * lasted {@link sayWaitingAfterMs}.
   */
  waitingFor(what: string | undefined): void;
  /** Takes the live line away, so the caller can print the step's finished ✓ or ✕ line in its place. */
  end(): void;
}

export interface ProgressOptions {
  /** Whether the stream has live lines (the style's `live`). Without them nothing is drawn. */
  readonly live: boolean;
  readonly line: LiveLine;
  readonly clock?: Clock;
}

/** What a stream without live lines gets: no line at all, only the finished line the caller prints. */
const silent: Progress = { waitingFor: () => {}, end: () => {} };

/**
 * Starts the live line of a step (cli-output 1.5). For its first second it
 * shows nothing, then one ◌ line with what it's doing. When the step has been
 * waiting on the same thing for 10 seconds, the line says what and for how
 * long: "◌ Draft reply · waiting for Anthropic (12 s)". There's no spinner:
 * the line changes only when its words do.
 *
 * @param doing - what the step is doing, in the present tense, such as "Draft reply"
 */
export function startProgress(doing: Phrase, options: ProgressOptions): Progress {
  if (!options.live) {
    return silent;
  }
  const { line, clock = systemClock } = options;
  const startedAt = clock.now();
  let wait: { readonly what: string; readonly since: number } | undefined;
  let shown: Message | undefined;

  const current = (): Message | undefined => {
    const now = clock.now();
    if (now - startedAt < showAfterMs) {
      return undefined;
    }
    if (wait !== undefined && now - wait.since >= sayWaitingAfterMs) {
      const seconds = Math.floor((now - wait.since) / 1_000);
      return progressMessages.waiting(doing, wait.what, seconds);
    }
    return progressMessages.doing(doing);
  };

  const redraw = () => {
    const next = current();
    if (next !== undefined && !sameWords(next, shown)) {
      line.draw(next);
      shown = next;
    }
  };

  const stop = clock.every(1_000, redraw);
  let ended = false;
  return {
    waitingFor(what) {
      if (!ended && what !== wait?.what) {
        wait = what === undefined ? undefined : { what, since: clock.now() };
        redraw();
      }
    },
    end() {
      ended = true;
      stop();
      if (shown !== undefined) {
        line.clear();
        shown = undefined;
      }
    },
  };
}

function sameWords(a: Message, b: Message | undefined): boolean {
  return b !== undefined && JSON.stringify(a.phrase) === JSON.stringify(b.phrase);
}
