import type { ServerResponse } from "node:http";

/** An answer that sends one JSON value per line, for as long as it stays open. */
export interface NdjsonStream {
  /** Sends one value as a line. Does nothing once the stream has ended. */
  send(value: unknown): void;
  /** Ends the answer. Safe to call twice. */
  end(): void;
  /** Settles when the stream ends, by {@link NdjsonStream.end} or because the caller went away. */
  readonly ended: Promise<void>;
}

/** Starts a 200 answer whose body is newline-delimited JSON (NDJSON). */
export function startNdjsonStream(response: ServerResponse): NdjsonStream {
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
  });
  // Send the head now, so the caller knows the stream is open before the first line.
  response.flushHeaders();

  let open = true;
  let markEnded: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    markEnded = resolve;
  });
  const finish = (): void => {
    open = false;
    markEnded();
  };
  response.once("close", finish);

  return {
    send(value) {
      if (open) response.write(`${JSON.stringify(value)}\n`);
    },
    end() {
      if (!open) return;
      finish();
      response.end();
    },
    ended,
  };
}
