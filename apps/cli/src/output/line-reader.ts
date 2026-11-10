import type { Readable } from "node:stream";

/**
 * Reads stdin one line at a time, for the answers to yes-or-no questions.
 * It reads only while a line is wanted and pauses stdin in between, so a
 * command that asks nothing never holds the process open. What comes after
 * a line is kept for the next one, so two answers typed or pasted at once
 * answer two questions.
 */
export class LineReader {
  readonly #input: Readable;
  #buffered = "";
  #ended = false;

  constructor(input: Readable) {
    this.#input = input;
    // Whole characters, also when a chunk ends in the middle of one.
    input.setEncoding("utf8");
  }

  /** The next line without its line ending, or `undefined` when stdin has ended. */
  readLine(): Promise<string | undefined> {
    const line = this.#takeLine();
    if (line !== undefined || this.#ended) {
      return Promise.resolve(line ?? this.#takeRest());
    }
    return new Promise((resolve) => {
      const done = (answer: string | undefined) => {
        this.#input.off("data", onData);
        this.#input.off("end", onEnd);
        this.#input.pause();
        resolve(answer);
      };
      const onData = (chunk: string) => {
        this.#buffered += chunk;
        const next = this.#takeLine();
        if (next !== undefined) {
          done(next);
        }
      };
      const onEnd = () => {
        this.#ended = true;
        done(this.#takeRest());
      };
      this.#input.on("data", onData);
      this.#input.on("end", onEnd);
      this.#input.resume();
    });
  }

  /** The first whole line in the buffer, or `undefined` when there's none yet. */
  #takeLine(): string | undefined {
    const end = this.#buffered.indexOf("\n");
    if (end === -1) {
      return undefined;
    }
    const line = this.#buffered.slice(0, end);
    this.#buffered = this.#buffered.slice(end + 1);
    return line.endsWith("\r") ? line.slice(0, -1) : line;
  }

  /** After stdin ended: the text after the last line ending, if any, as the last line. */
  #takeRest(): string | undefined {
    const rest = this.#buffered;
    this.#buffered = "";
    return rest === "" ? undefined : rest;
  }
}
