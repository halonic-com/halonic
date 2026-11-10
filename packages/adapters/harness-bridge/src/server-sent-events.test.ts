import { encodeUtf8 } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { ServerSentEventReader } from "./server-sent-events.ts";

/** Reads `chunks` one after the other and returns every event they make up. */
function readAll(...chunks: (string | Uint8Array)[]) {
  const reader = new ServerSentEventReader();
  return chunks.flatMap((chunk) =>
    reader.read(typeof chunk === "string" ? encodeUtf8(chunk) : chunk),
  );
}

describe("ServerSentEventReader", () => {
  it("reads events with their type and data", () => {
    expect(readAll('event: ping\ndata: {}\n\nevent: message_stop\ndata: {"a":1}\n\n')).toEqual([
      { event: "ping", data: "{}" },
      { event: "message_stop", data: '{"a":1}' },
    ]);
  });

  it("joins data lines, names an untyped event `message`, and skips comments and other fields", () => {
    expect(readAll(": keep-alive\nid: 7\ndata: one\ndata:two\n\n")).toEqual([
      { event: "message", data: "one\ntwo" },
    ]);
  });

  it("ends lines at LF, CR LF or CR", () => {
    expect(readAll("data: a\r\n\r\ndata: b\r\rdata: c\n\n")).toEqual([
      { event: "message", data: "a" },
      { event: "message", data: "b" },
      { event: "message", data: "c" },
    ]);
  });

  it("reads an event split across chunks anywhere, inside a character or a CR LF included", () => {
    const bytes = encodeUtf8("data: é\r\n\r\n");
    const split = [bytes.slice(0, 7), bytes.slice(7, 9), bytes.slice(9, 11), bytes.slice(11)];
    expect(readAll(...split)).toEqual([{ event: "message", data: "é" }]);
  });

  it("returns nothing for an event that hasn't ended, or that had no data", () => {
    const reader = new ServerSentEventReader();
    expect(reader.read(encodeUtf8("event: ping\n\ndata: half"))).toEqual([]);
    expect(reader.read(encodeUtf8("\n\n"))).toEqual([{ event: "message", data: "half" }]);
  });
});
