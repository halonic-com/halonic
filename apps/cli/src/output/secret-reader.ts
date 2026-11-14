import type { Readable } from "node:stream";
import { TypeAhead } from "./type-ahead.ts";

/** A terminal's input: a stream that can stop the terminal from showing what's typed. */
export interface TerminalInput extends Readable {
  setRawMode(raw: boolean): unknown;
}

const interrupt = "\u0003";
const endOfInput = "\u0004";
const escapeKey = "\u001b";
const escapeAfterStart: Readonly<Record<string, "csi" | "last">> = { "[": "csi", O: "last" };
const backspaces = new Set(["\u007f", "\b"]);

/**
 * Reads what the user types on a terminal without showing it, for a password.
 * The terminal goes into raw mode only while a value is wanted and comes back
 * after it, whichever way the reading ends. What was typed after the Enter,
 * such as a second value pasted with the first, is kept for the next one, in
 * the `ahead` it shares with the line reader.
 *
 * In raw mode Ctrl C is a character, not a signal, so it calls `onInterrupt`
 * (the process's own SIGINT). The reading then waits for the command's stop
 * signal to be aborted by it, so the command sees "stopped", not an empty
 * answer, and the command stops the way it does anywhere else.
 */
export class SecretReader {
  readonly #input: TerminalInput;
  readonly #onInterrupt: () => void;
  readonly #ahead: TypeAhead;

  constructor(input: TerminalInput, onInterrupt: () => void, ahead = new TypeAhead()) {
    this.#input = input;
    this.#onInterrupt = onInterrupt;
    this.#ahead = ahead;
    // Whole characters, also when a chunk ends in the middle of one.
    input.setEncoding("utf8");
  }

  /**
   * The next value typed, without its line ending, or `undefined` when stdin
   * ended before anything was typed or `signal` was aborted. Backspace removes
   * the last character; arrow keys and other escape sequences and control
   * characters are ignored.
   */
  readSecret(signal?: AbortSignal): Promise<string | undefined> {
    if (signal?.aborted === true || (this.#ahead.ended && this.#ahead.text === "")) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      const keys: Keys = { typed: [], escape: "none", interrupted: false };
      const finish = (value: string | undefined) => {
        this.#input.off("data", onData);
        this.#input.off("end", onEnd);
        signal?.removeEventListener("abort", onAbort);
        this.#input.setRawMode(false);
        this.#input.pause();
        resolve(value);
      };
      const take = (characters: readonly string[]) => {
        if (keys.interrupted) {
          return;
        }
        const outcome = this.#read(keys, characters);
        if (outcome === undefined) {
          return;
        }
        if (!keys.interrupted) {
          finish(outcome.value);
        } else if (signal === undefined) {
          // Nothing will abort, so waiting would hang.
          finish(undefined);
        }
      };
      const onData = (chunk: string) => take([...chunk]);
      const onEnd = () => {
        this.#ahead.ended = true;
        finish(keys.interrupted || keys.typed.length === 0 ? undefined : keys.typed.join(""));
      };
      const onAbort = () => finish(undefined);
      signal?.addEventListener("abort", onAbort);
      this.#input.on("data", onData);
      this.#input.on("end", onEnd);
      this.#input.setRawMode(true);
      this.#input.resume();
      const earlier = [...this.#ahead.text];
      this.#ahead.text = "";
      take(earlier);
    });
  }

  /**
   * Applies the typed characters until one ends the reading, and keeps what
   * came after it for the next value. `undefined` while the value goes on.
   * Ctrl C sets `keys.interrupted`.
   */
  #read(keys: Keys, characters: readonly string[]): { value: string | undefined } | undefined {
    for (const [at, character] of characters.entries()) {
      const step = applyKey(keys, character);
      if (step === "continue") {
        continue;
      }
      const after = characters.slice(at + 1);
      // "\r\n" is one line ending.
      const skipsLineFeed = character === "\r" && after[0] === "\n";
      this.#ahead.text = step === "interrupt" ? "" : after.slice(skipsLineFeed ? 1 : 0).join("");
      if (step === "interrupt") {
        keys.interrupted = true;
        this.#onInterrupt();
      }
      return { value: step === "line" ? keys.typed.join("") : undefined };
    }
    return undefined;
  }
}

/** The state of one reading: the value so far, a half-read escape sequence, and whether Ctrl C came. */
interface Keys {
  readonly typed: string[];
  /**
   * `csi` is inside `ESC [ …`, which ends at a character from `@` to `~`;
   * `last` is before the last character of `ESC O x`.
   */
  escape: "none" | "start" | "csi" | "last";
  interrupted: boolean;
}

/** What a typed character does: it ends the value, stops the command, ends the input or goes on. */
function applyKey(keys: Keys, key: string): "continue" | "line" | "interrupt" | "end" {
  const { typed } = keys;
  if (keys.escape === "start") {
    // `ESC [` opens a sequence such as an arrow key; `ESC O x` has one more character, `ESC x` none.
    keys.escape = escapeAfterStart[key] ?? "none";
    return "continue";
  }
  if (keys.escape === "last") {
    keys.escape = "none";
    return "continue";
  }
  if (keys.escape === "csi") {
    if (key >= "@" && key <= "~") {
      keys.escape = "none";
    }
    return "continue";
  }
  if (key === escapeKey) {
    keys.escape = "start";
    return "continue";
  }
  if (key === "\n" || key === "\r") {
    return "line";
  }
  if (key === interrupt) {
    return "interrupt";
  }
  if (key === endOfInput && typed.length === 0) {
    return "end";
  }
  if (backspaces.has(key)) {
    typed.pop();
  } else if (key >= " ") {
    typed.push(key);
  }
  return "continue";
}
