/** One server-sent event: its `event:` name ("message" when it has none) and its `data:` lines joined. */
export interface ServerSentEvent {
  event: string;
  data: string;
}

/**
 * The server-sent events in a response body, as they arrive. Lines may end
 * in `\n`, `\r\n` or `\r`, and a chunk may end mid-line or mid-character.
 * An event the body cuts off before its blank line is dropped, as the
 * standard says.
 *
 * Stopping early (a `break` or a thrown error in the caller's loop) cancels
 * the body, so the connection closes.
 *
 * @throws whatever reading the body throws, such as the abort reason
 */
export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new EventParser();
  let readToEnd = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        readToEnd = true;
        yield* parser.push(`${decoder.decode()}\n`);
        return;
      }
      yield* parser.push(decoder.decode(chunk.value, { stream: true }));
    }
  } finally {
    if (!readToEnd) await cancelQuietly(reader);
  }
}

/**
 * Cancels a body we stop reading. It may already have failed (an abort or
 * a dropped connection); that error is the one the caller sees, so a
 * second one from cancelling adds nothing.
 */
async function cancelQuietly(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The body has already failed; the caller gets that error instead.
  }
}

/** Turns text, chunk by chunk, into complete events. */
class EventParser {
  #pending = "";
  #event = "";
  #data: string[] = [];

  /** The events that `text`, added to what came before, completes. */
  push(text: string): ServerSentEvent[] {
    const input = this.#pending + text;
    // A `\r` at the very end may be the first half of `\r\n`; keep it for the next chunk.
    const heldBack = input.endsWith("\r") ? "\r" : "";
    const lines = input.slice(0, input.length - heldBack.length).split(/\r\n|\r|\n/);
    this.#pending = (lines.pop() ?? "") + heldBack;
    const events: ServerSentEvent[] = [];
    for (const line of lines) {
      const event = this.#readLine(line);
      if (event !== undefined) events.push(event);
    }
    return events;
  }

  #readLine(line: string): ServerSentEvent | undefined {
    if (line === "") return this.#dispatch();
    if (line.startsWith(":")) return undefined;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") this.#event = value;
    if (field === "data") this.#data.push(value);
    return undefined;
  }

  #dispatch(): ServerSentEvent | undefined {
    const event = this.#event === "" ? "message" : this.#event;
    const data = this.#data;
    this.#event = "";
    this.#data = [];
    return data.length === 0 ? undefined : { event, data: data.join("\n") };
  }
}
