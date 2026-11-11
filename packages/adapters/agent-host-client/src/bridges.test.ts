import type {
  BridgeApprovals,
  BridgeEvent,
  BridgeRecorder,
  BridgeTools,
  OpenHarnessBridge,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import {
  AgentHostBridges,
  type BridgeServices,
  bridgeOpenLimitMs,
  fitsAnswerLimit,
} from "./bridges.ts";
import { FakeHost, type FakeStream, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostError } from "./transport.ts";

const agent = { runId: "run-1", agentId: "writer" };
const opened = { type: "opened", bridge: "b1", url: "http://127.0.0.1:41817", token: "run-token" };

/** Services that answer nothing; each test sets the one it calls. */
function services(overrides: Partial<BridgeServices> = {}): BridgeServices {
  const tools: BridgeTools = {
    list: async () => [],
    check: async () => ({ kind: "run" }),
    call: async () => ({ result: "done", outcome: "ok" }),
  };
  const approvals: BridgeApprovals = { request: async () => ({ approved: true }) };
  return {
    providers: { anthropic: { kind: "key", secret: "anthropic-key" } },
    prices: {},
    tools,
    approvals,
    secrets: { get: async () => null },
    ...overrides,
  };
}

const recorder: BridgeRecorder = { record: async () => {} };

function hostAnswering(): FakeHost {
  return new FakeHost()
    .answer("POST /v1/bridge/answer", ok({ answered: true }))
    .answer("POST /v1/bridge/close", ok({ closed: true }));
}

/** Opens a bridge on `host`, whose stream sends `opened` first. */
async function openOn(
  host: FakeHost,
  served: BridgeServices = services(),
  events: BridgeRecorder = recorder,
): Promise<{ bridges: AgentHostBridges; bridge: OpenHarnessBridge; stream: FakeStream }> {
  const bridges = new AgentHostBridges(host, { servicesFor: () => served });
  const streamOpened = host.nextStream("POST /v1/bridge/open");
  const opening = bridges.open(agent, events);
  const stream = await streamOpened;
  stream.send(opened);
  return { bridges, bridge: await opening, stream };
}

function answersSent(host: FakeHost): unknown[] {
  return host.calls
    .filter((call) => call.route === "POST /v1/bridge/answer")
    .map((call) => call.body);
}

/** Waits until `host` has had `count` answers, and returns them. */
async function answers(host: FakeHost, count: number): Promise<unknown[]> {
  await vi.waitFor(() => expect(answersSent(host)).toHaveLength(count));
  return answersSent(host);
}

verifies("agent-host-client.bridges", () => {
  describe("AgentHostBridges.open", () => {
    it("opens the bridge with the run, the agent, the providers and the prices", async () => {
      const host = hostAnswering();
      const prices = { anthropic: { "claude-sonnet-5-5": { input: 3, output: 15 } } };
      const served = services({ prices });
      const { bridges, bridge } = await openOn(host, served);
      expect(host.calls[0]).toEqual({
        route: "POST /v1/bridge/open",
        body: { ...agent, providers: served.providers, prices },
      });
      expect(bridge).toMatchObject({ url: opened.url, token: opened.token });
      expect(bridges.idOf(bridge)).toBe("b1");
      expect(bridges.idOf({ url: opened.url, token: "another" })).toBeUndefined();
    });

    it("throws the host's refusal before any stream starts", async () => {
      const host = hostAnswering().refuseStream(
        "POST /v1/bridge/open",
        refused(429, "too_many_bridges", "Too many bridges."),
      );
      const bridges = new AgentHostBridges(host, { servicesFor: () => services() });
      await expect(bridges.open(agent, recorder)).rejects.toMatchObject({
        status: 429,
        kind: "too_many_bridges",
      });
    });

    it("throws the host's failure and hangs up when the bridge couldn't listen", async () => {
      const host = hostAnswering();
      const bridges = new AgentHostBridges(host, { servicesFor: () => services() });
      const streamOpened = host.nextStream("POST /v1/bridge/open");
      const opening = bridges.open(agent, recorder);
      const stream = await streamOpened;
      stream.send({ type: "failed", message: "No port free." });
      await expect(opening).rejects.toEqual(
        new AgentHostError(200, "bridge_failed", "No port free."),
      );
      expect(stream.signal.aborted).toBe(true);
    });

    it("hangs up when the first line isn't of the expected shape", async () => {
      const host = hostAnswering();
      const bridges = new AgentHostBridges(host, { servicesFor: () => services() });
      const streamOpened = host.nextStream("POST /v1/bridge/open");
      const opening = bridges.open(agent, recorder);
      const stream = await streamOpened;
      stream.send({ type: "opened", bridge: "b1" });
      await expect(opening).rejects.toMatchObject({ kind: "answer_invalid" });
      expect(stream.signal.aborted).toBe(true);
    });

    it("throws when the stream ends before the bridge opened", async () => {
      const host = hostAnswering();
      const bridges = new AgentHostBridges(host, { servicesFor: () => services() });
      const streamOpened = host.nextStream("POST /v1/bridge/open");
      const opening = bridges.open(agent, recorder);
      (await streamOpened).end();
      await expect(opening).rejects.toMatchObject({ kind: "bridge_failed" });
    });

    it("throws and hangs up when the first line never comes", async () => {
      vi.useFakeTimers();
      try {
        const host = hostAnswering();
        const bridges = new AgentHostBridges(host, { servicesFor: () => services() });
        const streamOpened = host.nextStream("POST /v1/bridge/open");
        const opening = bridges.open(agent, recorder);
        const failed = expect(opening).rejects.toMatchObject({ kind: "bridge_failed" });
        const stream = await streamOpened;
        await vi.advanceTimersByTimeAsync(bridgeOpenLimitMs - 1);
        expect(stream.signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await failed;
        expect(stream.signal.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("the bridge's calls", () => {
    it("answers secrets.get with Studio's key", async () => {
      const host = hostAnswering();
      const get = vi.fn(async (name: string) => (name === "anthropic-key" ? "test-value" : null));
      const { stream } = await openOn(host, services({ secrets: { get } }));
      stream.send({
        type: "call",
        call: "1",
        method: "secrets.get",
        params: { name: "anthropic-key" },
      });
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", result: "test-value" }]);
    });

    it("answers null for a key no provider of the bridge names, without asking for it", async () => {
      const host = hostAnswering();
      const get = vi.fn(async () => "test-value");
      const { stream } = await openOn(host, services({ secrets: { get } }));
      stream.send({
        type: "call",
        call: "1",
        method: "secrets.get",
        params: { name: "github-token" },
      });
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", result: null }]);
      expect(get).not.toHaveBeenCalled();
    });

    it("records the bridge's events with the run's recorder and answers null", async () => {
      const host = hostAnswering();
      const recorded: BridgeEvent[] = [];
      const events: BridgeRecorder = { record: async (event) => void recorded.push(event) };
      const { stream } = await openOn(host, services(), events);
      const event = { type: "llm.request", provider: "anthropic", model: "claude-sonnet-5-5" };
      stream.send({ type: "call", call: "1", method: "recorder.record", params: event });
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", result: null }]);
      expect(recorded).toEqual([event]);
    });

    it("answers the tool calls with Studio's tools", async () => {
      const host = hostAnswering();
      const tools: BridgeTools = {
        list: async () => [{ name: "search", description: "Searches.", parameters: {} }],
        check: async (name) =>
          name === "search" ? { kind: "run" } : { kind: "refused", reason: "No." },
        call: async (name, args) => ({ result: `${name} ${JSON.stringify(args)}`, outcome: "ok" }),
      };
      const { stream } = await openOn(host, services({ tools }));
      stream.send({ type: "call", call: "1", method: "tools.list", params: {} });
      stream.send({
        type: "call",
        call: "2",
        method: "tools.check",
        params: { name: "x", args: {} },
      });
      stream.send({
        type: "call",
        call: "3",
        method: "tools.call",
        params: { name: "search", args: { q: "a" } },
      });
      const sent = await answers(host, 3);
      expect(sent).toContainEqual({
        bridge: "b1",
        call: "1",
        result: [{ name: "search", description: "Searches.", parameters: {} }],
      });
      expect(sent).toContainEqual({
        bridge: "b1",
        call: "2",
        result: { kind: "refused", reason: "No." },
      });
      expect(sent).toContainEqual({
        bridge: "b1",
        call: "3",
        result: { result: 'search {"q":"a"}', outcome: "ok" },
      });
    });

    it("answers an error for an unknown method, the wrong arguments or a failing service", async () => {
      const host = hostAnswering();
      const failing = { get: async () => Promise.reject(new Error("The key store is locked.")) };
      const { stream } = await openOn(host, services({ secrets: failing }));
      stream.send({ type: "call", call: "1", method: "files.read", params: {} });
      stream.send({ type: "call", call: "2", method: "tools.call", params: { name: "search" } });
      stream.send({
        type: "call",
        call: "3",
        method: "secrets.get",
        params: { name: "anthropic-key" },
      });
      const sent = await answers(host, 3);
      expect(sent).toContainEqual({
        bridge: "b1",
        call: "1",
        error: `Studio doesn't answer the bridge's "files.read" calls.`,
      });
      expect(sent).toContainEqual({
        bridge: "b1",
        call: "2",
        error: "The bridge called tools.call with arguments of the wrong shape.",
      });
      expect(sent).toContainEqual({ bridge: "b1", call: "3", error: "The key store is locked." });
    });

    it("skips a line that is neither a call nor a cancel", async () => {
      const host = hostAnswering();
      const { stream } = await openOn(host);
      stream.send({ type: "hello" });
      stream.send({
        type: "call",
        call: "1",
        method: "secrets.get",
        params: { name: "anthropic-key" },
      });
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", result: null }]);
    });

    it("answers an error for a call line of the wrong shape, and takes a line with a new field", async () => {
      const host = hostAnswering();
      const { stream } = await openOn(host);
      stream.send({ type: "call", call: "1", method: 7, params: {} });
      stream.send({ type: "call", call: "2", method: "tools.list", params: {}, sentAt: 1 });
      const sent = await answers(host, 2);
      expect(sent).toContainEqual({
        bridge: "b1",
        call: "1",
        error: "The bridge's call wasn't of the expected shape.",
      });
      expect(sent).toContainEqual({ bridge: "b1", call: "2", result: [] });
    });

    it("skips a call whose id is still waiting, so the first can still be cancelled", async () => {
      const host = hostAnswering();
      const signals: AbortSignal[] = [];
      const approvals: BridgeApprovals = {
        request: (_request, { signal }) => {
          signals.push(signal);
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("Withdrawn.")), { once: true });
          });
        },
      };
      const { stream } = await openOn(host, services({ approvals }));
      const approval = { callId: "c1", tool: "Bash", args: { command: "ls" } };
      stream.send({ type: "call", call: "1", method: "approvals.request", params: approval });
      stream.send({ type: "call", call: "1", method: "approvals.request", params: approval });
      stream.send({ type: "call", call: "2", method: "tools.list", params: {} });
      await answers(host, 1);
      expect(signals).toHaveLength(1);
      stream.send({ type: "cancel", call: "1" });
      await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true));
    });

    it("answers a quick call while an approval waits, and a cancel aborts the approval unanswered", async () => {
      const host = hostAnswering();
      let approvalSignal: AbortSignal | undefined;
      const approvals: BridgeApprovals = {
        request: (_request, { signal }) => {
          approvalSignal = signal;
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("Withdrawn.")), { once: true });
          });
        },
      };
      const { stream } = await openOn(host, services({ approvals }));
      const approval = { callId: "c1", tool: "Bash", args: { command: "ls" } };
      stream.send({ type: "call", call: "1", method: "approvals.request", params: approval });
      stream.send({ type: "call", call: "2", method: "tools.list", params: {} });
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "2", result: [] }]);
      stream.send({ type: "cancel", call: "1" });
      await vi.waitFor(() => expect(approvalSignal?.aborted).toBe(true));
      stream.end();
      await Promise.resolve();
      expect(answersSent(host)).toHaveLength(1);
    });
  });

  describe("answers the host can't take (HAL-4730)", () => {
    const unsendable = "Studio's answer to this call couldn't be sent to the agent host.";
    const unencodable = "Studio's answer to this call couldn't be encoded as JSON.";
    const limit = 1024 * 1024;
    /** The answer's bytes around a `secrets.get` result: `{"bridge":"b1","call":"1","result":""}`. */
    const envelope = JSON.stringify({ bridge: "b1", call: "1", result: "" }).length;

    /** A bridge whose `anthropic-key` is `key`, asked for it as call 1. */
    async function answerKey(host: FakeHost, key: string): Promise<void> {
      const { stream } = await openOn(host, services({ secrets: { get: async () => key } }));
      stream.send({
        type: "call",
        call: "1",
        method: "secrets.get",
        params: { name: "anthropic-key" },
      });
    }
    const tooLarge = {
      bridge: "b1",
      call: "1",
      error:
        "Studio's answer to this call is larger than the agent host takes (1 MiB), so it wasn't sent.",
    };

    it("sends an error for the call instead of an answer over 1 MiB", async () => {
      const host = hostAnswering();
      const tools = services().tools;
      const big: BridgeTools = {
        ...tools,
        call: async () => ({ result: "x".repeat(2 * 1024 * 1024), outcome: "ok" }),
      };
      const { stream } = await openOn(host, services({ tools: big }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([tooLarge]);
    });

    it("sends an error for the call when the host answers 413", async () => {
      const host = hostAnswering().answer("POST /v1/bridge/answer", (body) =>
        "result" in (body as object)
          ? refused(413, "body_too_large", "Too large.")
          : ok({ answered: true }),
      );
      const { stream } = await openOn(host);
      stream.send({
        type: "call",
        call: "1",
        method: "secrets.get",
        params: { name: "anthropic-key" },
      });
      expect(await answers(host, 2)).toEqual([{ bridge: "b1", call: "1", result: null }, tooLarge]);
    });

    it("sends an error for the call when the host refuses the answer for another reason", async () => {
      const host = hostAnswering().answer("POST /v1/bridge/answer", (body) =>
        "result" in (body as object) ? refused(400, "bad_request", "No.") : ok({ answered: true }),
      );
      const { stream } = await openOn(host);
      stream.send({ type: "call", call: "1", method: "tools.list", params: {} });
      expect(await answers(host, 2)).toEqual([
        { bridge: "b1", call: "1", result: [] },
        { bridge: "b1", call: "1", error: unsendable },
      ]);
    });

    it("sends an error for a result with no JSON form, and still closes", async () => {
      const host = hostAnswering();
      const tools = services().tools;
      const odd: BridgeTools = {
        ...tools,
        call: async () => ({ result: "done", outcome: "ok", bytes: 10n }) as never,
      };
      const { bridge, stream } = await openOn(host, services({ tools: odd }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", error: unencodable }]);
      stream.end();
      await expect(bridge.close()).resolves.toBeUndefined();
    });

    it("sends an answer of exactly 1 MiB, envelope included, as it is", async () => {
      const host = hostAnswering();
      const key = "k".repeat(limit - envelope);
      await answerKey(host, key);
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", result: key }]);
    });

    it("sends an error when the result fits but its envelope takes the answer over 1 MiB", async () => {
      const host = hostAnswering();
      await answerKey(host, "k".repeat(limit - envelope + 1));
      expect(await answers(host, 1)).toEqual([tooLarge]);
    });

    it("counts a 4-byte character as 4 bytes, not as its 2 UTF-16 units", async () => {
      const host = hostAnswering();
      // Half the limit in UTF-16 units, but over it in UTF-8 bytes.
      await answerKey(host, "\u{1f600}".repeat(limit / 4));
      expect(await answers(host, 1)).toEqual([tooLarge]);
    });

    it("sends the too-large error for a service whose error message is over 1 MiB", async () => {
      const host = hostAnswering();
      const failing: BridgeTools = {
        ...services().tools,
        call: async () => {
          throw new Error("e".repeat(2 * limit));
        },
      };
      const { stream } = await openOn(host, services({ tools: failing }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([tooLarge]);
    });

    it("sends the error answer once when the host answers 413 to it as well", async () => {
      const host = hostAnswering().answer(
        "POST /v1/bridge/answer",
        refused(413, "body_too_large", "Too large."),
      );
      const { bridge, stream } = await openOn(host);
      stream.send({ type: "call", call: "1", method: "tools.list", params: {} });
      expect(await answers(host, 2)).toEqual([{ bridge: "b1", call: "1", result: [] }, tooLarge]);
      stream.end();
      await bridge.close();
      expect(answersSent(host)).toHaveLength(2);
    });

    it("answers a service that rejects with a value it can't turn into text", async () => {
      const host = hostAnswering();
      const failing: BridgeTools = {
        ...services().tools,
        call: () => Promise.reject(Object.create(null)),
      };
      const { stream } = await openOn(host, services({ tools: failing }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([
        {
          bridge: "b1",
          call: "1",
          error: "Studio's service failed with an error it couldn't read.",
        },
      ]);
    });

    it("sends an error for a result whose toJSON throws", async () => {
      const host = hostAnswering();
      const odd: BridgeTools = {
        ...services().tools,
        call: async () =>
          ({
            result: "done",
            outcome: "ok",
            toJSON: () => {
              throw new Error("Not today.");
            },
          }) as never,
      };
      const { stream } = await openOn(host, services({ tools: odd }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", error: unencodable }]);
    });

    it("sends text cut in the middle of an emoji as well-formed text", async () => {
      const host = hostAnswering();
      const tools = services().tools;
      const cut: BridgeTools = {
        ...tools,
        call: async () => ({ result: "hi \ud83d", outcome: "ok" }),
      };
      const { stream } = await openOn(host, services({ tools: cut }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      expect(await answers(host, 1)).toEqual([
        { bridge: "b1", call: "1", result: { result: "hi \ufffd", outcome: "ok" } },
      ]);
    });

    it("measures the answer in UTF-8 bytes, not characters", () => {
      expect(fitsAnswerLimit("a".repeat(limit))).toBe(true);
      expect(fitsAnswerLimit("a".repeat(limit + 1))).toBe(false);
      // "é" is 2 bytes: half the limit in characters is the whole limit in bytes.
      expect(fitsAnswerLimit("é".repeat(limit / 2))).toBe(true);
      expect(fitsAnswerLimit(`${"é".repeat(limit / 2)}a`)).toBe(false);
      // An emoji is 2 UTF-16 units and 4 bytes.
      expect(fitsAnswerLimit("\u{1f600}".repeat(limit / 4))).toBe(true);
      expect(fitsAnswerLimit(`${"\u{1f600}".repeat(limit / 4)}a`)).toBe(false);
    });
  });

  describe("closing", () => {
    it("closes the bridge in the host and waits until its stream ends", async () => {
      const host = hostAnswering();
      const { bridges, bridge, stream } = await openOn(host);
      let closed = false;
      const closing = bridge.close().then(() => {
        closed = true;
      });
      await vi.waitFor(() =>
        expect(host.calls).toContainEqual({
          route: "POST /v1/bridge/close",
          body: { bridge: "b1" },
        }),
      );
      expect(closed).toBe(false);
      stream.end();
      await closing;
      expect(bridges.idOf(bridge)).toBeUndefined();
    });

    it("doesn't wait for a call whose service ignores the abort", async () => {
      const host = hostAnswering();
      let signal: AbortSignal | undefined;
      const stuck: BridgeTools = {
        ...services().tools,
        call: (_name, _args, options) => {
          signal = options.signal;
          return new Promise(() => {});
        },
      };
      const { bridge, stream } = await openOn(host, services({ tools: stuck }));
      stream.send({
        type: "call",
        call: "1",
        method: "tools.call",
        params: { name: "search", args: {} },
      });
      await vi.waitFor(() => expect(signal).toBeDefined());
      const closing = bridge.close();
      stream.end();
      await expect(closing).resolves.toBeUndefined();
      expect(signal?.aborted).toBe(true);
      expect(answersSent(host)).toEqual([]);
    });

    it("counts a bridge the host has already closed as closed", async () => {
      const host = hostAnswering().answer(
        "POST /v1/bridge/close",
        refused(404, "unknown_bridge", "No such bridge."),
      );
      const { bridge, stream } = await openOn(host);
      stream.end();
      await expect(bridge.close()).resolves.toBeUndefined();
    });

    it("hangs up and throws when the host refuses to close", async () => {
      const host = hostAnswering().answer(
        "POST /v1/bridge/close",
        refused(500, "internal", "Broke."),
      );
      const { bridge, stream } = await openOn(host);
      await expect(bridge.close()).rejects.toMatchObject({ status: 500, kind: "internal" });
      expect(stream.signal.aborted).toBe(true);
    });
  });
});
