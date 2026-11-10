/** One event of a `text/event-stream` body: its type and its `data` lines, joined with line feeds. */
export interface ServerSentEvent {
  /** The `event` field; `message` when the event names none. */
  event: string;
  data: string;
}

/**
 * Splits a `text/event-stream` body into events as its bytes arrive, by the
 * rules of https://html.spec.whatwg.org/multipage/server-sent-events.html: a
 * line ends with LF, CR LF or CR, and a blank line ends an event. Comments
 * and fields other than `event` and `data` are skipped. A chunk may end
 * anywhere, even inside a character or between a CR and its LF.
 *
 * @example
 * const reader = new ServerSentEventReader();
 * reader.read(encodeUtf8("event: ping\ndata: {}\n\n")); // [{ event: "ping", data: "{}" }]
 */
export class ServerSentEventReader {
  readonly #decoder = new TextDecoder();
  /** The text after the last complete line. */
  #rest = "";
  #event = "";
  #data: string[] = [];

  /** The events that `chunk` completes, in order. */
  read(chunk: Uint8Array): ServerSentEvent[] {
    let text = this.#rest + this.#decoder.decode(chunk, { stream: true });
    // A CR at the very end may be the first half of a CR LF: keep it for the next chunk.
    const heldCr = text.endsWith("\r") ? "\r" : "";
    if (heldCr !== "") text = text.slice(0, -1);
    const lines = text.split(/\r\n|\r|\n/);
    this.#rest = (lines.pop() ?? "") + heldCr;

    const events: ServerSentEvent[] = [];
    for (const line of lines) {
      const event = this.#readLine(line);
      if (event !== undefined) events.push(event);
    }
    return events;
  }

  /** Takes in one complete line, and returns the event a blank line ends. */
  #readLine(line: string): ServerSentEvent | undefined {
    if (line === "") return this.#endEvent();
    if (line.startsWith(":")) return undefined;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") this.#event = value;
    else if (field === "data") this.#data.push(value);
    return undefined;
  }

  /** The event the lines so far make up, or nothing when they had no data. */
  #endEvent(): ServerSentEvent | undefined {
    const event =
      this.#data.length === 0
        ? undefined
        : { event: this.#event === "" ? "message" : this.#event, data: this.#data.join("\n") };
    this.#event = "";
    this.#data = [];
    return event;
  }
}
