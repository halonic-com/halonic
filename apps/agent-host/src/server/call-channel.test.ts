import { describe, expect, it } from "vitest";
import { CallChannel, StudioCallError } from "./call-channel.ts";
import type { NdjsonStream } from "./ndjson-stream.ts";

/** A stream that keeps the lines it was given. */
function fakeStream(): NdjsonStream & { lines: unknown[] } {
  const lines: unknown[] = [];
  return { lines, send: (value) => lines.push(value), end: () => {}, ended: new Promise(() => {}) };
}

describe("CallChannel", () => {
  it("sends each call as a line and resolves it with Studio's answer", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const first = channel.call("tools.list", {});
    const second = channel.call("secrets.get", { name: "key" });
    expect(stream.lines).toEqual([
      { type: "call", call: "1", method: "tools.list", params: {} },
      { type: "call", call: "2", method: "secrets.get", params: { name: "key" } },
    ]);
    expect(channel.answer("2", { result: "value" })).toBe(true);
    expect(channel.answer("1", { result: [] })).toBe(true);
    await expect(second).resolves.toBe("value");
    await expect(first).resolves.toEqual([]);
    expect(channel.answer("1", { result: [] })).toBe(false);
  });

  it("rejects a call Studio answers with an error, naming the method", async () => {
    const channel = new CallChannel(fakeStream());
    const call = channel.call("tools.call", {});
    channel.answer("1", { error: "the connection is gone" });
    await expect(call).rejects.toThrow(
      new StudioCallError("Studio couldn't answer tools.call: the connection is gone"),
    );
  });

  it("tells Studio to stop when the signal aborts, and forgets the call", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const stop = new AbortController();
    const call = channel.call("approvals.request", {}, { signal: stop.signal });
    stop.abort(new Error("cancelled"));
    await expect(call).rejects.toThrow("cancelled");
    expect(stream.lines.at(-1)).toEqual({ type: "cancel", call: "1" });
    expect(channel.answer("1", { result: { approved: true } })).toBe(false);
  });

  it("fails waiting and later calls once it closes", async () => {
    const channel = new CallChannel(fakeStream());
    const waiting = channel.call("recorder.record", {});
    channel.close();
    await expect(waiting).rejects.toBeInstanceOf(StudioCallError);
    await expect(channel.call("tools.list", {})).rejects.toThrow(
      "closed before it answered tools.list",
    );
  });
});
