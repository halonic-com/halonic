import type { ChatTurnRequest, ChatTurnResponse, ChatTurnText } from "@halonicjs/ports";

/** The media type of a streamed chat turn: one JSON object per line. */
export const chatTurnStreamType = "application/x-ndjson";

/** Whether the caller's `Accept` header names {@link chatTurnStreamType}, with or without parameters. */
export function wantsChatTurnStream(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept
    .split(",")
    .some((range) => range.split(";")[0]?.trim().toLowerCase() === chatTurnStreamType);
}

/**
 * One line of a streamed chat turn: a piece of the answer's text, a restart
 * (the text so far is void, because another model answers), and last the
 * response or the error, never both.
 */
export type ChatTurnLine =
  | { readonly text: string }
  | { readonly restart: true }
  | { readonly response: ChatTurnResponse }
  | { readonly error: object };

function lineOf(text: ChatTurnText): ChatTurnLine {
  return text.kind === "delta" ? { text: text.text } : { restart: true };
}

/**
 * Answers a chat turn as a stream of {@link ChatTurnLine}s. The 200 goes out
 * before the model has written anything, so a failure can only travel as the
 * last line: `failure` turns it into the error line's body, or into `null`
 * when nothing is to be sent. A turn that was stopped sends no last line. The
 * model call stops when the caller closes the request or stops reading the
 * body, whichever the runtime reports first.
 *
 * @param chatTurn runs the turn: the executor's `chatTurn`
 */
export function streamChatTurn(
  chatTurn: (turn: ChatTurnRequest) => Promise<ChatTurnResponse>,
  turn: ChatTurnRequest,
  request: Request,
  failure: (error: unknown) => object,
): Response {
  const readerGone = new AbortController();
  const signal = AbortSignal.any([request.signal, readerGone.signal]);
  const encoder = new TextEncoder();
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // JSON.stringify never writes a raw newline, so each line is one object.
      const send = (line: ChatTurnLine) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      };
      const answer = async () => {
        try {
          send({
            response: await chatTurn({ ...turn, signal, onText: (text) => send(lineOf(text)) }),
          });
        } catch (error) {
          // A caller that has gone reads nothing, and the abort isn't a fault to log.
          if (!signal.aborted) send({ error: failure(error) });
        } finally {
          if (open) {
            open = false;
            controller.close();
          }
        }
      };
      // Not awaited: the 200 and the lines go out while the model writes.
      void answer();
    },
    cancel(reason) {
      open = false;
      readerGone.abort(reason);
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": chatTurnStreamType,
      // A proxy that buffers the body would hold every line back.
      "X-Accel-Buffering": "no",
    },
  });
}
