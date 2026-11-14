import type { Readable } from "node:stream";
import { TypeAhead } from "./type-ahead.ts";

/**
 * Reads stdin one line at a time, for the answers to yes-or-no questions.
 * It reads only while a line is wanted and pauses stdin in between, so a
 * command that asks nothing never holds the process open. What comes after
 * a line is kept for the next one, so two answers typed or pasted at once
 * answer two questions. Text typed ahead is shared with the secret reader
 * through `ahead`.
 */
export class LineReader {
  readonly #input: Readable;
  readonly #ahead: TypeAhead;

  constructor(input: Readable, ahead = new TypeAhead()) {
    this.#input = input;
    this.#ahead = ahead;
    // Whole characters, also when a chunk ends in the middle of one.
    input.setEncoding("utf8");
  }

  /**
   * The next line without its line ending, or `undefined` when stdin has
   * ended. When `signal` is aborted, such as by Ctrl C, it stops reading and
   * gives `undefined`; what was typed so far stays for the next line.
   */
  readLine(signal?: AbortSignal): Promise<string | undefined> {
    const line = this.#takeLine();
    if (line !== undefined || this.#ahead.ended) {
      return Promise.resolve(line ?? this.#takeRest());
    }
    if (signal?.aborted === true) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      const done = (answer: string | undefined) => {
        this.#input.off("data", onData);
        this.#input.off("end", onEnd);
        signal?.removeEventListener("abort", onAbort);
        this.#input.pause();
        resolve(answer);
      };
      const onData = (chunk: string) => {
        this.#ahead.text += chunk;
        const next = this.#takeLine();
        if (next !== undefined) {
          done(next);
        }
      };
      const onEnd = () => {
        this.#ahead.ended = true;
        done(this.#takeRest());
      };
      const onAbort = () => done(undefined);
      signal?.addEventListener("abort", onAbort);
      this.#input.on("data", onData);
      this.#input.on("end", onEnd);
      this.#input.resume();
    });
  }

  /** The first whole line in the buffer, or `undefined` when there's none yet. */
  #takeLine(): string | undefined {
    const end = this.#ahead.text.indexOf("\n");
    if (end === -1) {
      return undefined;
    }
    const line = this.#ahead.text.slice(0, end);
    this.#ahead.text = this.#ahead.text.slice(end + 1);
    return line.endsWith("\r") ? line.slice(0, -1) : line;
  }

  /** After stdin ended: the text after the last line ending, if any, as the last line. */
  #takeRest(): string | undefined {
    const rest = this.#ahead.text;
    this.#ahead.text = "";
    return rest === "" ? undefined : rest;
  }
}
