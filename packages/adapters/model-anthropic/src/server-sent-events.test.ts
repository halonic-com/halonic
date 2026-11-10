import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readServerSentEvents, type ServerSentEvent } from "./server-sent-events.ts";

/** A body that sends `chunks` one by one, and says whether it was cancelled. */
function bodyOf(chunks: Array<string | Uint8Array>) {
  const state = { cancelled: false };
  const queue = chunks.map((chunk) =>
    typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk,
  );
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();
      if (next === undefined) controller.close();
      else controller.enqueue(next);
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { body, state };
}

async function eventsIn(chunks: Array<string | Uint8Array>): Promise<ServerSentEvent[]> {
  const events: ServerSentEvent[] = [];
  for await (const event of readServerSentEvents(bodyOf(chunks).body)) events.push(event);
  return events;
}

verifies("model-anthropic.server-sent-events", () => {
  it("reads named events, joins data lines, and skips comments and empty events", async () => {
    const text = ": hello\n\nevent: ping\ndata: {}\n\ndata: one\ndata:two\nid: 7\n\n";
    expect(await eventsIn([text])).toEqual([
      { event: "ping", data: "{}" },
      { event: "message", data: "one\ntwo" },
    ]);
  });

  it("reads lines ending in \\r\\n or \\r, split anywhere, even between \\r and \\n", async () => {
    const chunks = ["event: a\r", "\ndata: 1\r\n\r", "\nevent: b\rdata", ": 2\r\r"];
    expect(await eventsIn(chunks)).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ]);
  });

  it("joins a character split across chunks, and drops an event cut off at the end", async () => {
    const bytes = new TextEncoder().encode("data: café\n\ndata: cut");
    const split = bytes.indexOf(0xc3) + 1;
    expect(await eventsIn([bytes.slice(0, split), bytes.slice(split)])).toEqual([
      { event: "message", data: "café" },
    ]);
  });

  it("cancels the body when the reader stops early, and not when it read to the end", async () => {
    const early = bodyOf(["data: 1\n\n", "data: 2\n\n"]);
    for await (const _event of readServerSentEvents(early.body)) break;
    expect(early.state.cancelled).toBe(true);

    const full = bodyOf(["data: 1\n\n"]);
    for await (const _event of readServerSentEvents(full.body)) {
      // Read every event.
    }
    expect(full.state.cancelled).toBe(false);
  });
});
