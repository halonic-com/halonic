/** The data OpenAI sends as the last event of a stream. */
const endOfStream = "[DONE]";

/**
 * The `data` of each server-sent event in `body`, in order, until the body
 * ends or the server sends `[DONE]`. Comments and other fields are skipped.
 * Stopping early, or a failure, cancels the body, so the call is closed.
 *
 * @example
 * for await (const data of readSseData(response.body)) chunks.push(JSON.parse(data));
 */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let dataLines: string[] = [];
  for await (const line of thenBlankLine(readLines(body))) {
    const data = dataOf(line);
    if (data !== undefined) dataLines.push(data);
    // A blank line ends an event.
    if (line !== "" || dataLines.length === 0) continue;
    const event = dataLines.join("\n");
    dataLines = [];
    if (event === endOfStream) return;
    yield event;
  }
}

/** The lines of a UTF-8 text body, read as it arrives. */
async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let partLine = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      let text = partLine + decoder.decode(value, { stream: !done });
      // A last \r may be the first half of \r\n; keep it until the next read shows.
      const heldBack = !done && text.endsWith("\r") ? "\r" : "";
      if (heldBack !== "") text = text.slice(0, -1);
      // SSE ends a line with \r\n, \n or a lone \r.
      const lines = text.split(/\r\n|\r|\n/);
      // The last piece may be half a line; keep it for the next read.
      partLine = (lines.pop() ?? "") + heldBack;
      yield* lines;
      if (done) {
        if (partLine !== "") yield partLine;
        return;
      }
    }
  } finally {
    // Closes the call when the caller stops early or the read fails; a no-op once it ended.
    await reader.cancel().catch(() => undefined);
  }
}

/** `lines`, then one blank line, which ends an event the server didn't finish. */
async function* thenBlankLine(lines: AsyncGenerator<string>): AsyncGenerator<string> {
  yield* lines;
  yield "";
}

/** The value of a `data:` line, without the one space after the colon; undefined for other lines. */
function dataOf(line: string): string | undefined {
  if (!line.startsWith("data:")) return undefined;
  const value = line.slice("data:".length);
  return value.startsWith(" ") ? value.slice(1) : value;
}
