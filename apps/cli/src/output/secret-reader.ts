import type { Readable } from "node:stream";

/** A terminal's input: a stream that can stop the terminal from showing what's typed. */
export interface TerminalInput extends Readable {
  setRawMode(raw: boolean): unknown;
}

const interrupt = "\u0003";
const endOfInput = "\u0004";
const backspaces = new Set(["\u007f", "\b"]);

/**
 * Reads what the user types on a terminal without showing it, for a password.
 * The terminal goes into raw mode only while a value is wanted and comes back
 * after it, whichever way the reading ends. What was typed after the Enter,
 * such as a second value pasted with the first, is kept for the next one.
 *
 * In raw mode Ctrl C is a character, not a signal, so it calls `onInterrupt`
 * (the process's own SIGINT), and the command stops the way it does anywhere
 * else.
 */
export class SecretReader {
  readonly #input: TerminalInput;
  readonly #onInterrupt: () => void;
  #pending: string[] = [];

  constructor(input: TerminalInput, onInterrupt: () => void) {
    this.#input = input;
    this.#onInterrupt = onInterrupt;
    // Whole characters, also when a chunk ends in the middle of one.
    input.setEncoding("utf8");
  }

  /**
   * The next value typed, without its line ending, or `undefined` when stdin
   * ended before anything was typed or `signal` was aborted. Backspace removes
   * the last character; other control characters are ignored.
   */
  readSecret(signal?: AbortSignal): Promise<string | undefined> {
    if (signal?.aborted === true) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      const typed: string[] = [];
      const finish = (value: string | undefined) => {
        this.#input.off("data", onData);
        this.#input.off("end", onEnd);
        signal?.removeEventListener("abort", onAbort);
        this.#input.setRawMode(false);
        this.#input.pause();
        resolve(value);
      };
      const take = (characters: readonly string[]) => {
        const outcome = this.#read(typed, characters);
        if (outcome !== undefined) {
          finish(outcome.value);
        }
      };
      const onData = (chunk: string) => take([...chunk]);
      const onEnd = () => finish(typed.length === 0 ? undefined : typed.join(""));
      const onAbort = () => finish(undefined);
      signal?.addEventListener("abort", onAbort);
      this.#input.on("data", onData);
      this.#input.on("end", onEnd);
      this.#input.setRawMode(true);
      this.#input.resume();
      const earlier = this.#pending;
      this.#pending = [];
      take(earlier);
    });
  }

  /**
   * Applies the typed characters until one ends the reading, and keeps what
   * came after it for the next value. `undefined` while the value goes on.
   */
  #read(typed: string[], characters: readonly string[]): { value: string | undefined } | undefined {
    for (const [at, character] of characters.entries()) {
      const step = applyKey(typed, character);
      if (step === "continue") {
        continue;
      }
      const after = characters.slice(at + 1);
      // "\r\n" is one line ending.
      const skipsLineFeed = character === "\r" && after[0] === "\n";
      this.#pending = step === "interrupt" ? [] : after.slice(skipsLineFeed ? 1 : 0);
      if (step === "interrupt") {
        this.#onInterrupt();
      }
      return { value: step === "line" ? typed.join("") : undefined };
    }
    return undefined;
  }
}

/** What a typed character does: it ends the value, stops the command, ends the input or goes on. */
function applyKey(typed: string[], key: string): "continue" | "line" | "interrupt" | "end" {
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
