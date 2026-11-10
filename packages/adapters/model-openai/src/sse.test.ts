import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readSseData } from "./sse.ts";

/** A body that sends `parts` one read each, and says whether it was cancelled. */
function bodyOf(parts: Array<string | Uint8Array>) {
  const state = { cancelled: false };
  const queue = parts.map((part) =>
    typeof part === "string" ? new TextEncoder().encode(part) : part,
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

async function dataIn(parts: Array<string | Uint8Array>): Promise<string[]> {
  const read: string[] = [];
  for await (const data of readSseData(bodyOf(parts).body)) read.push(data);
  return read;
}

verifies("model-openai.stream", () => {
  it("joins events and characters split across reads, and stops at [DONE]", async () => {
    const bytes = new TextEncoder().encode("data: 東京\r\n\r\n");
    const parts = [
      bytes.slice(0, 8),
      bytes.slice(8),
      ": keep-alive\n\nda",
      "ta: {}\n\n",
      "data: [DONE]\n\ndata: late\n\n",
    ];
    expect(await dataIn(parts)).toEqual(["東京", "{}"]);
  });

  it("joins the data lines of one event, and ends an unfinished last event", async () => {
    expect(await dataIn(["event: x\ndata: a\ndata:b\n\n", "data: c"])).toEqual(["a\nb", "c"]);
  });

  it("ends lines at a lone \\r, and at a \\r\\n split across reads", async () => {
    expect(await dataIn(["data: a\r\rdata: b\r", "\ndata: c\r\n\r\n"])).toEqual(["a", "b\nc"]);
  });

  it("cancels the body when the reader stops early", async () => {
    const { body, state } = bodyOf(["data: 1\n\n", "data: 2\n\n"]);
    for await (const _data of readSseData(body)) break;
    expect(state.cancelled).toBe(true);
  });
});
