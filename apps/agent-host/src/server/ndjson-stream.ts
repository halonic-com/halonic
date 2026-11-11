import type { ServerResponse } from "node:http";

/**
 * The most the host keeps of a stream the caller hasn't read yet. A caller
 * that keeps the stream open but stops reading it would otherwise make every
 * line pile up in the host's memory. Lines are small (a blocked access, a
 * call to Studio), so a reader that keeps up never comes near this.
 */
export const maxUnsentBytes = 4 * 1024 * 1024;

/** An answer that sends one JSON value per line, for as long as it stays open. */
export interface NdjsonStream {
  /**
   * Sends one value as a line. Does nothing once the stream has ended. Ends
   * the stream when more than {@link maxUnsentBytes} wait to be sent.
   */
  send(value: unknown): void;
  /** Ends the answer. Safe to call twice. */
  end(): void;
  /**
   * Settles when the stream ends: by {@link NdjsonStream.end}, because the
   * caller went away, or because the caller stopped reading.
   */
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
      if (!open) return;
      response.write(`${JSON.stringify(value)}\n`);
      if (response.writableLength > maxUnsentBytes) {
        // The caller isn't reading. A clean end would still wait to send the
        // backlog, so drop the connection: that frees it now, and the caller
        // sees a cut-off answer rather than one that looks complete.
        finish();
        response.destroy();
      }
    },
    end() {
      if (!open) return;
      finish();
      response.end();
    },
    ended,
  };
}
