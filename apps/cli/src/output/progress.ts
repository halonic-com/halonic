import type { Message } from "../messages/define.ts";
import { fitPhrase, type Phrase, renderPhrase } from "../messages/phrase.ts";
import { progressMessages } from "../messages/progress.ts";
import { paintFor } from "./paint.ts";
import type { OutputStyle } from "./style.ts";

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

/**
 * The computer's own clock. It counts on `performance.now()`, which never
 * jumps when the system time is set, and its timer doesn't keep Node running
 * on its own: a command that is done exits even if a step forgot to end.
 */
export const systemClock: Clock = {
  now: () => performance.now(),
  every(ms, tick) {
    const timer = setInterval(tick, ms);
    timer.unref();
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

/** The terminal stream a {@link terminalLine} draws on. */
export interface TerminalStream {
  /** Writes text to the stream as it is, without adding a newline. */
  write(text: string): void;
  /** The stream's style, for its colours and marks. */
  readonly style: OutputStyle;
  /** How wide the terminal is now, such as `process.stderr.columns`, or `undefined` when it doesn't say. */
  columns(): number | undefined;
}

/**
 * The {@link LiveLine} of a terminal stream: each draw replaces the line by
 * going back to its start, so it writes no newline. Only for a stream whose
 * style has live lines on; a pipe would keep every drawn line.
 *
 * The line is cut to the terminal's width, less one column so the cursor
 * never wraps: a line that wrapped couldn't be erased, and each draw would
 * leave a copy behind. The width is read at each draw, so a resized
 * window gets the right cut.
 */
export function terminalLine(stream: TerminalStream): LiveLine {
  const paint = paintFor(stream.style);
  const render = (message: Message): string => {
    const columns = stream.columns();
    const words =
      columns === undefined
        ? message.phrase
        : fitPhrase(message.phrase, columns - 1, stream.style.unicode);
    return renderPhrase(words, paint);
  };
  return {
    draw: (message) => stream.write(`${eraseLine}${render(message)}`),
    clear: () => stream.write(eraseLine),
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
 * long: "◌ Draft a reply · waiting for Anthropic (12 s)". There's no spinner:
 * the line changes only when its words do.
 *
 * @param doing - what the step is doing, in the present tense, such as "Draft a reply"
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
