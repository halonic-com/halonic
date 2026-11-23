import type { ChatTurnRequest, ChatTurnResponse } from "@halonicjs/ports";
import { chatTurnLineError, RemoteProtocolError } from "./errors.ts";

/** The media type of a streamed chat turn: one JSON object per line (`server.chat-turn-stream`). */
export const chatTurnStreamType = "application/x-ndjson";

/** The longest line the reader holds while it waits for the line's end, in characters: 16 MiB, as for a stream message. */
export const maxChatTurnLineLength = 16 * 1024 * 1024;

/** Whether the host answered with a stream, rather than the whole turn as an older host does. */
export function isChatTurnStream(response: Response): boolean {
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return type === chatTurnStreamType;
}

/**
 * The lines of a body, each once its line end arrived: a line the body ends
 * in the middle of is dropped, so a connection that broke never delivers part
 * of one.
 */
async function* readLines(
  body: ReadableStream<Uint8Array>,
  maxLineLength: number,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      pending += decoder.decode(value, { stream: true });
      let end = pending.indexOf("\n");
      while (end !== -1) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line !== "") yield line;
        end = pending.indexOf("\n");
      }
      if (pending.length > maxLineLength) {
        throw new RemoteProtocolError(
          `The host sent a chat turn line longer than ${maxLineLength} characters.`,
        );
      }
    }
  } finally {
    // Stops the download, and so the model call on the host, when the reader stops early. Cancelling
    // fails only for a body that already broke, and `read` has thrown that error to the caller.
    await reader.cancel().catch(() => {});
  }
}

function parseLine(line: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new RemoteProtocolError("The host sent a chat turn line that isn't JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new RemoteProtocolError("The host sent a chat turn line that isn't an object.");
  }
  return parsed as Record<string, unknown>;
}

/**
 * Reads a streamed chat turn: each text and restart line goes to `onText` as
 * it arrives, and the turn resolves with the response line or rejects with the
 * error line, which the host sends last. A body that ends without either, or
 * holds a line that is none of these, rejects, so the turn counts as failed.
 * When `onText` throws, the reading stops, which closes the request, and the
 * turn rejects with what it threw.
 *
 * @throws RemoteProtocolError when the stream ends without its last line, or a line isn't one the host sends
 */
export async function readChatTurnStream(
  body: ReadableStream<Uint8Array>,
  onText: NonNullable<ChatTurnRequest["onText"]>,
  maxLineLength: number = maxChatTurnLineLength,
): Promise<ChatTurnResponse> {
  for await (const text of readLines(body, maxLineLength)) {
    const line = parseLine(text);
    if (typeof line["text"] === "string") {
      onText({ kind: "delta", text: line["text"] });
    } else if (line["restart"] === true) {
      onText({ kind: "restart" });
    } else if (typeof line["response"] === "object" && line["response"] !== null) {
      return line["response"] as ChatTurnResponse;
    } else if ("error" in line) {
      throw chatTurnLineError(line["error"]);
    } else {
      throw new RemoteProtocolError("The host sent a chat turn line of a kind it doesn't send.");
    }
  }
  throw new RemoteProtocolError("The host's chat turn ended before its answer.");
}
