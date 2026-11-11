import { afterEach, describe, expect, it, vi } from "vitest";
import { CallChannel, StudioCallError } from "./call-channel.ts";
import type { NdjsonStream } from "./ndjson-stream.ts";

/** A stream that keeps the lines it was given, and ends when `ended` settles. */
function fakeStream(
  ended: Promise<void> = new Promise(() => {}),
): NdjsonStream & { lines: unknown[] } {
  const lines: unknown[] = [];
  return { lines, send: (value) => lines.push(value), end: () => {}, ended };
}

afterEach(() => {
  vi.useRealTimers();
});

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

  it("fails waiting and later calls once its stream ends, as when Studio crashes", async () => {
    let endStream: () => void = () => {};
    const channel = new CallChannel(
      fakeStream(
        new Promise((resolve) => {
          endStream = resolve;
        }),
      ),
    );
    const waiting = channel.call("secrets.get", { name: "key" });
    endStream();
    await expect(waiting).rejects.toThrow("closed before it answered secrets.get");
    await expect(channel.call("tools.list", {})).rejects.toBeInstanceOf(StudioCallError);
  });

  it("fails a call on a stream that had already ended", async () => {
    const channel = new CallChannel(fakeStream(Promise.resolve()));
    await expect(channel.call("recorder.record", {})).rejects.toBeInstanceOf(StudioCallError);
  });

  it("gives up on a call Studio doesn't answer within its time limit, and tells Studio", async () => {
    vi.useFakeTimers();
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const call = channel.call("tools.check", {}, { timeLimitMs: 1_000 });
    const settled = expect(call).rejects.toThrow(
      new StudioCallError("Studio didn't answer tools.check within 1000 ms."),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
    expect(stream.lines.at(-1)).toEqual({ type: "cancel", call: "1" });
    expect(channel.answer("1", { result: { kind: "run" } })).toBe(false);
  });

  it("keeps an answered call's result after its time limit would have run out", async () => {
    vi.useFakeTimers();
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const call = channel.call("tools.list", {}, { timeLimitMs: 1_000 });
    channel.answer("1", { result: [] });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(call).resolves.toEqual([]);
    expect(stream.lines).toHaveLength(1);
  });

  it("waits as long as it takes for a call without a time limit", async () => {
    vi.useFakeTimers();
    const channel = new CallChannel(fakeStream());
    let settled = false;
    void channel.call("approvals.request", {}).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);
    expect(settled).toBe(false);
    channel.answer("1", { result: { approved: true } });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
  });
});
