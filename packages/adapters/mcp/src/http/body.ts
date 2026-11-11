import { McpError } from "../protocol/errors.ts";

/** The error for an answer larger than the message limit. */
function tooLarge(maxMessageBytes: number): McpError {
  return new McpError(
    "unexpected-response",
    `The MCP server sent a message larger than ${maxMessageBytes} bytes.`,
  );
}

/**
 * Reads a whole body as text, refusing it once it passes `maxMessageBytes`,
 * so a server can't fill our memory.
 */
export async function readText(
  body: ReadableStream<Uint8Array>,
  maxMessageBytes: number,
): Promise<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxMessageBytes) throw tooLarge(maxMessageBytes);
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * The `data` of each `message` event in a `text/event-stream` body, as its
 * bytes arrive, by the rules of
 * https://html.spec.whatwg.org/multipage/server-sent-events.html: a line
 * ends with LF, CR LF or CR, a blank line ends an event, and its `data`
 * lines are joined with line feeds. Comments, other fields, events of
 * other types and events without data are skipped: MCP sends none we use.
 *
 * One event's data may take at most `maxMessageBytes` in UTF-8, and a line
 * still being read at most as many characters. The stream is cancelled
 * when the caller stops reading, so the connection doesn't stay open.
 */
export async function* eventData(
  body: ReadableStream<Uint8Array>,
  maxMessageBytes: number,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const lines = new LineSplitter();
  const event = new PendingEvent(maxMessageBytes);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      for (const line of lines.read(value)) {
        const data = event.read(line);
        if (data !== undefined) yield data;
      }
      if (lines.restLength > maxMessageBytes) throw tooLarge(maxMessageBytes);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Splits text arriving in chunks into lines. A chunk may end anywhere, even inside a character. */
class LineSplitter {
  readonly #decoder = new TextDecoder();
  /** The text after the last complete line. */
  #rest = "";

  /** How many characters of an unfinished line are waiting for its end. */
  get restLength(): number {
    return this.#rest.length;
  }

  /** The lines that `chunk` completes, in order, without their ends. */
  read(chunk: Uint8Array): string[] {
    let text = this.#rest + this.#decoder.decode(chunk, { stream: true });
    // A CR at the very end may be the first half of a CR LF: keep it for the next chunk.
    const heldCr = text.endsWith("\r") ? "\r" : "";
    if (heldCr !== "") text = text.slice(0, -1);
    const lines = text.split(/\r\n|\r|\n/);
    this.#rest = (lines.pop() ?? "") + heldCr;
    return lines;
  }
}

/** The fields of the event being read, until a blank line ends it. */
class PendingEvent {
  readonly #encoder = new TextEncoder();
  readonly #maxBytes: number;
  #type = "";
  #data: string[] = [];
  /** How many bytes of data the event holds so far. */
  #bytes = 0;

  constructor(maxBytes: number) {
    this.#maxBytes = maxBytes;
  }

  /**
   * Takes in one complete line, and returns the data of a `message` event it ends.
   *
   * @throws {McpError} when the event's data passes the limit
   */
  read(line: string): string | undefined {
    if (line === "") return this.#end();
    if (line.startsWith(":")) return undefined;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") this.#type = value;
    if (field === "data") {
      this.#data.push(value);
      this.#bytes += this.#encoder.encode(value).byteLength;
      if (this.#bytes > this.#maxBytes) throw tooLarge(this.#maxBytes);
    }
    return undefined;
  }

  #end(): string | undefined {
    const isMessage = this.#type === "" || this.#type === "message";
    const data = isMessage && this.#data.length > 0 ? this.#data.join("\n") : undefined;
    this.#type = "";
    this.#data = [];
    this.#bytes = 0;
    return data;
  }
}
