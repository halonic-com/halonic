/** One message of a server-sent event stream. */
export interface SseMessage {
  /** The `event:` name; `message` when the sender gave none. */
  readonly event: string;
  /** The `id:` the sender gave, or `null`. */
  readonly id: string | null;
  /** The `data:` lines joined with a newline. */
  readonly data: string;
}

/** The field and value of a line, or `null` for a blank line or a comment. */
function parseLine(line: string): { field: string; value: string } | null {
  if (line === "" || line.startsWith(":")) {
    return null;
  }
  const colon = line.indexOf(":");
  if (colon === -1) {
    return { field: line, value: "" };
  }
  const value = line.slice(colon + 1);
  return { field: line.slice(0, colon), value: value.startsWith(" ") ? value.slice(1) : value };
}

/** The message in one block of lines, or `null` when it has no data (a comment or a keep-alive). */
function parseBlock(block: string): SseMessage | null {
  let event = "message";
  let id: string | null = null;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    const parsed = parseLine(line);
    if (parsed?.field === "event") event = parsed.value;
    if (parsed?.field === "id") id = parsed.value;
    if (parsed?.field === "data") data.push(parsed.value);
  }
  return data.length === 0 ? null : { event, id, data: data.join("\n") };
}

/**
 * Reads server-sent events from a response body, parsed by hand because
 * `EventSource` can't send a session cookie from a native client or be
 * given a signal. A message counts only once its blank line arrived: when
 * the body ends in the middle of one, that half message is dropped, so a
 * connection that broke never delivers part of an event.
 */
export async function* readSseMessages(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  // A CR that ended the last chunk waits here: an LF at the start of the next chunk joins it into one line end.
  let heldCr = false;
  const drain = function* (): Generator<SseMessage> {
    let end = pending.indexOf("\n\n");
    while (end !== -1) {
      const message = parseBlock(pending.slice(0, end));
      pending = pending.slice(end + 2);
      if (message !== null) {
        yield message;
      }
      end = pending.indexOf("\n\n");
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        // The body ended, so no LF can follow a held CR: it is a line end of its own.
        if (heldCr) {
          pending += "\n";
          yield* drain();
        }
        return;
      }
      let text: string = (heldCr ? "\r" : "") + decoder.decode(value, { stream: true });
      heldCr = text.endsWith("\r");
      if (heldCr) text = text.slice(0, -1);
      // A lone CR also ends a line in the format; one newline form keeps the split simple.
      pending += text.replace(/\r\n?/g, "\n");
      yield* drain();
    }
  } finally {
    // Stops the download when the reader of the messages stops early. Cancelling fails only
    // for a stream that already broke, and `read` has thrown that error to the caller.
    await reader.cancel().catch(() => {});
  }
}
