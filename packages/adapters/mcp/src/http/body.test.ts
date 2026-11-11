import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { eventData, readText } from "./body.ts";

const encoder = new TextEncoder();

/** A body that arrives in exactly these chunks, text as UTF-8. */
function bodyOf(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

/** A body that tells whether it was cancelled. */
function watchedBodyOf(...chunks: string[]): {
  body: ReadableStream<Uint8Array>;
  cancelled: () => boolean;
} {
  let cancelled = false;
  let next = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[next++];
      if (chunk === undefined) controller.close();
      else controller.enqueue(encoder.encode(chunk));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { body, cancelled: () => cancelled };
}

async function events(body: ReadableStream<Uint8Array>, maxMessageBytes = 4096): Promise<string[]> {
  const seen: string[] = [];
  for await (const data of eventData(body, maxMessageBytes)) seen.push(data);
  return seen;
}

/** Text that stands for the server's own words: no error may repeat it. */
const serverText = "sk-acme-secret";

verifies("mcp.http-transport", () => {
  describe("the message limit", () => {
    it("reads a JSON answer up to the limit, across chunks", async () => {
      await expect(readText(bodyOf("12345", "67890"), 10)).resolves.toBe("1234567890");
    });

    it("refuses a JSON answer over the limit without the server's text", async () => {
      const failure = readText(bodyOf(serverText, "x".repeat(10)), 16);
      await expect(failure).rejects.toMatchObject({
        code: "unexpected-response",
        message: "The MCP server sent a message larger than 16 bytes.",
      });
      await expect(failure).rejects.not.toThrow(serverText);
    });

    it("counts the bytes of a JSON answer, not its characters", async () => {
      // Four characters of two bytes each.
      await expect(readText(bodyOf("éééé"), 8)).resolves.toBe("éééé");
      await expect(readText(bodyOf("éééé"), 7)).rejects.toMatchObject({
        code: "unexpected-response",
      });
    });

    it("stops reading a JSON answer once it passes the limit", async () => {
      const { body, cancelled } = watchedBodyOf("x".repeat(20), "never read");
      await expect(readText(body, 10)).rejects.toMatchObject({ code: "unexpected-response" });
      expect(cancelled()).toBe(true);
    });

    it("reads an event whose data is just at the limit", async () => {
      await expect(events(bodyOf(`data: ${"x".repeat(16)}\n\n`), 16)).resolves.toEqual([
        "x".repeat(16),
      ]);
    });

    it("refuses an event whose data passes the limit, without the server's text", async () => {
      const failure = events(bodyOf(`data: ${serverText}\n`, `data: ${serverText}\n\n`), 20);
      await expect(failure).rejects.toMatchObject({
        code: "unexpected-response",
        message: "The MCP server sent a message larger than 20 bytes.",
      });
      await expect(failure).rejects.not.toThrow(serverText);
    });

    it("counts the bytes of an event's data, not its characters", async () => {
      await expect(events(bodyOf("data: éééé\n\n"), 8)).resolves.toEqual(["éééé"]);
      await expect(events(bodyOf("data: éééé\n\n"), 7)).rejects.toMatchObject({
        code: "unexpected-response",
      });
    });

    it("refuses an unfinished line that passes the limit, without the server's text", async () => {
      const failure = events(bodyOf(`data: ${serverText}`, "x".repeat(10)), 20);
      await expect(failure).rejects.toMatchObject({ code: "unexpected-response" });
      await expect(failure).rejects.not.toThrow(serverText);
    });

    it("takes an unfinished line up to the limit", async () => {
      // 16 characters wait for their line end after the first chunk.
      await expect(events(bodyOf(`data: ${"x".repeat(10)}`, "\n\n"), 16)).resolves.toEqual([
        "x".repeat(10),
      ]);
    });

    it("starts counting again for each event", async () => {
      const body = bodyOf(`data: ${"x".repeat(16)}\n\n`, `data: ${"y".repeat(16)}\n\n`);
      await expect(events(body, 16)).resolves.toEqual(["x".repeat(16), "y".repeat(16)]);
    });
  });

  describe("event-stream lines", () => {
    it.each([
      ["LF", "\n"],
      ["CR LF", "\r\n"],
      ["a lone CR", "\r"],
    ])("ends lines with %s", async (_name, end) => {
      const body = bodyOf(`data: one${end}${end}data: two${end}${end}`);
      await expect(events(body)).resolves.toEqual(["one", "two"]);
    });

    it("reads a CR LF split across two chunks as one line end", async () => {
      // Read as two line ends, the LF would end the event between its data lines.
      const body = bodyOf("data: one\r", "\ndata: two\r", "\n\r\n");
      await expect(events(body)).resolves.toEqual(["one\ntwo"]);
    });

    it("reads a CR at the end of a chunk, without an LF after it, as a line end", async () => {
      await expect(events(bodyOf("data: one\r", "\r", "data: two\r\r"))).resolves.toEqual([
        "one",
        "two",
      ]);
    });

    it("reads a character split across chunks", async () => {
      const bytes = encoder.encode("data: é€😀\n\n");
      const chunks = Array.from(bytes, (byte) => Uint8Array.of(byte));
      await expect(events(bodyOf(...chunks))).resolves.toEqual(["é€😀"]);
    });

    it("joins an event's data lines with LF", async () => {
      const body = bodyOf('data: {\ndata:  "a": 1\ndata\ndata: }\n\n');
      await expect(events(body)).resolves.toEqual(['{\n "a": 1\n\n}']);
    });

    it("skips comments, other fields, other event types and events without data", async () => {
      const body = bodyOf(
        ": keep-alive\n\n",
        "id: 1\nretry: 1000\n\n",
        "event: ping\ndata: skipped\n\n",
        "event: message\ndata: kept\n\n",
        ": a comment inside an event\nid: 2\ndata: also kept\n\n",
      );
      await expect(events(body)).resolves.toEqual(["kept", "also kept"]);
    });

    it("forgets the event type once its event ends", async () => {
      const body = bodyOf("event: ping\ndata: skipped\n\ndata: kept\n\n");
      await expect(events(body)).resolves.toEqual(["kept"]);
    });

    it("drops an event the stream ends in the middle of", async () => {
      await expect(events(bodyOf("data: one\n\ndata: cut off\n"))).resolves.toEqual(["one"]);
    });

    it("cancels the stream when the caller stops reading", async () => {
      const { body, cancelled } = watchedBodyOf("data: one\n\n", "data: two\n\n");
      for await (const _data of eventData(body, 4096)) break;
      expect(cancelled()).toBe(true);
    });
  });
});
