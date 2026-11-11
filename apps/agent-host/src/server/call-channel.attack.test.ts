import type { BridgeProvider, BridgeProviderAccess } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { studioSecrets, studioServices } from "../bridge/studio-services.ts";
import { CallChannel, type ChannelAnswer, StudioCallError } from "./call-channel.ts";
import type { NdjsonStream } from "./ndjson-stream.ts";

/**
 * Attacks on the calls from the host to Studio: answers that are replayed,
 * forged, late, of the wrong shape or for a call that was cancelled, and a
 * channel that closes under its calls. Whoever answers has the launch's
 * token; these check that a wrong or repeated answer can't settle a call it
 * doesn't belong to, or reach the bridge in a shape the port doesn't allow.
 */

function fakeStream(): NdjsonStream & { lines: unknown[] } {
  const lines: unknown[] = [];
  return { lines, send: (value) => lines.push(value), end: () => {}, ended: new Promise(() => {}) };
}

/** The id of the last call line sent on `stream`. */
function lastCall(stream: { lines: unknown[] }): string {
  const line = stream.lines.at(-1) as { type: string; call: string };
  expect(line.type).toBe("call");
  return line.call;
}

/** Settles once the microtasks queued so far have run. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("CallChannel, attacked through its answers", () => {
  it("settles a call once: a replayed answer changes nothing", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const call = channel.call("secrets.get", { name: "key" });
    const id = lastCall(stream);
    expect(channel.answer(id, { result: "first" })).toBe(true);
    expect(channel.answer(id, { result: "second" })).toBe(false);
    expect(channel.answer(id, { error: "late" })).toBe(false);
    await expect(call).resolves.toBe("first");
  });

  it("settles nothing for an id it never sent, however it's shaped", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    let settled = false;
    void channel.call("tools.list", {}).then(
      () => (settled = true),
      () => (settled = true),
    );
    const forged = ["0", "2", "-1", "01", "1 ", "", "__proto__", "constructor", "toString"];
    for (const id of forged) {
      expect(channel.answer(id, { result: [] }), JSON.stringify(id)).toBe(false);
    }
    await tick();
    expect(settled).toBe(false);
  });

  it("ignores an answer to a call whose signal aborted, even one that arrives straight after", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const stop = new AbortController();
    const call = channel.call("approvals.request", {}, { signal: stop.signal });
    const id = lastCall(stream);
    stop.abort(new Error("the person left"));
    expect(channel.answer(id, { result: { approved: true } })).toBe(false);
    await expect(call).rejects.toThrow("the person left");
    expect(stream.lines.filter((line) => (line as { type: string }).type === "cancel")).toEqual([
      { type: "cancel", call: id },
    ]);
  });

  it("sends no cancel and keeps the answer when the signal aborts after Studio answered", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const stop = new AbortController();
    const call = channel.call("tools.call", {}, { signal: stop.signal });
    channel.answer(lastCall(stream), { result: { result: "done", outcome: "ok" } });
    stop.abort();
    await expect(call).resolves.toEqual({ result: "done", outcome: "ok" });
    expect(stream.lines.some((line) => (line as { type: string }).type === "cancel")).toBe(false);
  });

  it("makes no call, and sends nothing, for a signal that has already aborted", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    await expect(channel.call("tools.call", {}, { signal: AbortSignal.abort() })).rejects.toThrow();
    expect(stream.lines).toEqual([]);
  });

  it("never reuses an id, so an old answer can't settle a new call", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const ids = new Set<string>();
    for (let index = 0; index < 50; index++) {
      const stop = new AbortController();
      const call = channel.call("tools.list", {}, { signal: stop.signal });
      ids.add(lastCall(stream));
      stop.abort();
      await call.catch(() => {});
    }
    expect(ids.size).toBe(50);
  });

  it("treats an answer with both a result and an error as an error", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const call = channel.call("approvals.request", {});
    const both = { result: { approved: true }, error: "refused" } as unknown as ChannelAnswer;
    channel.answer(lastCall(stream), both);
    await expect(call).rejects.toBeInstanceOf(StudioCallError);
  });

  it("fails every waiting call when it closes, and settles none of them after", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const calls = [1, 2, 3].map(() => channel.call("recorder.record", {}));
    const ids = stream.lines.map((line) => (line as { call: string }).call);
    channel.close();
    channel.close();
    for (const call of calls) await expect(call).rejects.toBeInstanceOf(StudioCallError);
    for (const id of ids) expect(channel.answer(id, { result: null })).toBe(false);
    await expect(channel.call("tools.list", {})).rejects.toBeInstanceOf(StudioCallError);
    expect(stream.lines).toHaveLength(3);
  });
});

describe("studioServices, given answers of the wrong shape", () => {
  /** Answers the next call on `stream` with `result`, once it has been sent. */
  async function answered<T>(
    stream: { lines: unknown[] },
    channel: CallChannel,
    pending: Promise<T>,
    result: unknown,
  ): Promise<T> {
    channel.answer(lastCall(stream), { result });
    return pending;
  }

  it("refuses a tool check that isn't one of the port's three kinds", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const { tools } = studioServices(channel);
    for (const result of [
      { kind: "allow" },
      { kind: "refused" },
      { kind: "RUN" },
      "run",
      null,
      undefined,
      [{ kind: "run" }],
    ]) {
      await expect(
        answered(stream, channel, tools.check("shell", {}), result),
        JSON.stringify(result),
      ).rejects.toThrow(StudioCallError);
    }
  });

  it("refuses an approval that is only truthy, not true", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const { approvals } = studioServices(channel);
    const signal = new AbortController().signal;
    const request = { tool: "shell", args: {} } as unknown as Parameters<
      typeof approvals.request
    >[0];
    for (const result of [{ approved: "true" }, { approved: 1 }, {}, true, null]) {
      await expect(
        answered(stream, channel, approvals.request(request, { signal }), result),
        JSON.stringify(result),
      ).rejects.toThrow(StudioCallError);
    }
  });

  it("refuses a tool list or tool result of the wrong shape", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const { tools } = studioServices(channel);
    for (const result of [
      {},
      null,
      [{ name: "x" }],
      [{ name: 1, description: "", parameters: {} }],
    ]) {
      await expect(answered(stream, channel, tools.list(), result)).rejects.toThrow(
        StudioCallError,
      );
    }
    const signal = new AbortController().signal;
    for (const result of [{ result: "x", outcome: "fine" }, { result: 1, outcome: "ok" }, "x"]) {
      await expect(
        answered(stream, channel, tools.call("shell", {}, { signal }), result),
      ).rejects.toThrow(StudioCallError);
    }
  });
});

describe("studioSecrets, asked for a secret the bridge doesn't name", () => {
  const providers: Partial<Record<BridgeProvider, BridgeProviderAccess>> = {
    anthropic: { kind: "key", secret: "anthropic-key" },
  } as unknown as Partial<Record<BridgeProvider, BridgeProviderAccess>>;

  it("answers null without asking Studio, whatever the name", async () => {
    const stream = fakeStream();
    const secrets = studioSecrets(new CallChannel(stream), providers);
    const names = [
      "openai-key",
      "ANTHROPIC-KEY",
      "anthropic-key ",
      " anthropic-key",
      "anthropic-key\u0000",
      "",
      "*",
      "__proto__",
      "constructor",
      "hasOwnProperty",
    ];
    for (const name of names) {
      expect(await secrets.get(name), JSON.stringify(name)).toBeNull();
    }
    expect(stream.lines).toEqual([]);
  });

  it("refuses a secret Studio answers in the wrong shape", async () => {
    const stream = fakeStream();
    const channel = new CallChannel(stream);
    const secrets = studioSecrets(channel, providers);
    for (const result of [42, { value: "k" }, ["k"], undefined]) {
      const pending = secrets.get("anthropic-key");
      channel.answer(lastCall(stream), { result });
      await expect(pending, JSON.stringify(result)).rejects.toThrow(StudioCallError);
    }
  });
});
