import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readSseMessages, type SseMessage } from "./sse.ts";

function bodyOf(chunks: readonly (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

async function messagesOf(chunks: readonly (string | Uint8Array)[]): Promise<SseMessage[]> {
  const messages: SseMessage[] = [];
  for await (const message of readSseMessages(bodyOf(chunks))) messages.push(message);
  return messages;
}

verifies("executor-remote.sse", () => {
  describe("readSseMessages", () => {
    it("joins a message that arrives in pieces", async () => {
      const messages = await messagesOf(["id: 1\nev", "ent: ru", 'n\ndata: {"seq":1}\n', "\n"]);
      expect(messages).toEqual([{ event: "run", id: "1", data: '{"seq":1}' }]);
    });

    it("keeps a multi-byte character that is cut between chunks", async () => {
      const bytes = new TextEncoder().encode("data: é\n\n");
      const messages = await messagesOf([bytes.slice(0, 7), bytes.slice(7)]);
      expect(messages).toEqual([{ event: "message", id: null, data: "é" }]);
    });

    it("joins several data lines with a newline", async () => {
      expect(await messagesOf(["data: a\ndata: b\n\n"])).toEqual([
        { event: "message", id: null, data: "a\nb" },
      ]);
    });

    it("skips comments and messages without data", async () => {
      expect(await messagesOf([": keep-alive\n\nevent: run\n\n"])).toEqual([]);
    });

    it("reads several messages from one chunk, whatever the line ends", async () => {
      const messages = await messagesOf(["event: run\r\ndata: 1\r\n\r\nevent: end\rdata: 2\r\r"]);
      expect(messages.map((message) => message.event)).toEqual(["run", "end"]);
    });

    it("reads a CRLF that is split between chunks as one line end, whatever the split", async () => {
      const bytes = new TextEncoder().encode(
        "event: run\r\ndata: 1\r\n\r\nevent: end\r\ndata: 2\r\n\r\n",
      );
      const expected = [
        { event: "run", id: null, data: "1" },
        { event: "end", id: null, data: "2" },
      ];
      expect(await messagesOf([...bytes].map((byte) => Uint8Array.of(byte)))).toEqual(expected);
      for (let cut = 1; cut < bytes.length; cut++) {
        expect(await messagesOf([bytes.slice(0, cut), bytes.slice(cut)])).toEqual(expected);
      }
    });

    it("ends a message on a CR that closes the body", async () => {
      expect(await messagesOf(["data: x\r", "\r"])).toEqual([
        { event: "message", id: null, data: "x" },
      ]);
    });

    it("drops a message that was cut off before its blank line", async () => {
      expect(await messagesOf(['event: run\ndata: {"se'])).toEqual([]);
    });

    it("stops the download when the reader stops early", async () => {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode("data: x\n\n"));
        },
        cancel() {
          cancelled = true;
        },
      });
      for await (const _message of readSseMessages(body)) break;
      expect(cancelled).toBe(true);
    });
  });
});
