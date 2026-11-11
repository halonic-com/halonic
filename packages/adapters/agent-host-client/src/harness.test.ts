import type { HarnessBridge, HarnessEvent, HarnessTask, SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, type FakeStream, ok, refused } from "./fake-host.test-helper.ts";
import { type AgentHostHarnessOptions, agentHostHarnesses } from "./harness.ts";
import { AgentHostSession } from "./sandbox.ts";

const task: HarnessTask = {
  runId: "run_1",
  hubId: "acme",
  agentId: "writer",
  instructions: "Write the reply.",
  prompt: "Reply to the customer.",
};

/** A made-up bridge, as `/v1/bridge/open` would answer it. */
const bridge: HarnessBridge = { url: "http://127.0.0.1:41817", token: "made-up-run-token" };

const options: AgentHostHarnessOptions = {
  bridgeIdOf: (each) => (each.token === bridge.token ? "b1" : undefined),
  environments: { "claude-code": (open) => ({ ANTHROPIC_BASE_URL: open.url }) },
};

const finished: HarnessEvent = { type: "agent.finished", agent: "writer", output: "Done." };

function hostWithHarnesses(): FakeHost {
  return new FakeHost()
    .answer(
      "GET /v1/harnesses",
      ok([
        { id: "claude-code", name: "Claude Code" },
        { id: "codex", name: "Codex" },
      ]),
    )
    .answer("POST /v1/harnesses/runs/send", ok({ sent: true }))
    .answer("POST /v1/harnesses/runs/cancel", ok({ cancelled: true }));
}

function hostSession(host: FakeHost): AgentHostSession {
  return new AgentHostSession(host, "s1", {} as SandboxProfile, { state: "fenced" });
}

async function claudeCode(host: FakeHost) {
  const [harness] = await agentHostHarnesses(host, options);
  if (harness === undefined) throw new Error("no harness");
  return harness;
}

/** Sends the run's `started` line and lets the run read it. */
async function start(stream: FakeStream, run: string): Promise<void> {
  stream.send({ type: "started", run });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function collect(events: AsyncIterable<HarnessEvent>): Promise<HarnessEvent[]> {
  const seen: HarnessEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

verifies("agent-host-client.harness", () => {
  describe("agentHostHarnesses", () => {
    it("offers one stand-in per harness the host lists, with its own environment", async () => {
      const harnesses = await agentHostHarnesses(hostWithHarnesses(), options);
      expect(harnesses.map(({ id, name }) => ({ id, name }))).toEqual([
        { id: "claude-code", name: "Claude Code" },
        { id: "codex", name: "Codex" },
      ]);
      const folders = { workingFolder: "/w", tempFolder: "/t", settingsFolder: "/s" };
      expect(harnesses[0]?.environment?.(bridge, folders)).toEqual({
        ANTHROPIC_BASE_URL: bridge.url,
      });
      expect(harnesses[1]?.environment).toBeUndefined();
    });

    it("answers detect as the host does", async () => {
      const detection = { status: "ready", version: "2.1.0" };
      const host = hostWithHarnesses().answer("POST /v1/harnesses/detect", ok(detection));
      const harness = await claudeCode(host);
      expect(await harness.detect()).toEqual(detection);
      expect(host.calls).toContainEqual({
        route: "POST /v1/harnesses/detect",
        body: { harness: "claude-code" },
      });
    });

    it("names the agent's settings folder to the host when detect is given one", async () => {
      const detection = { status: "signed-out", version: "2.1.0" };
      const host = hostWithHarnesses().answer("POST /v1/harnesses/detect", ok(detection));
      const harness = await claudeCode(host);
      const settingsFolder = "/halonic-data/settings/writer";
      expect(await harness.detect({ settingsFolder })).toEqual(detection);
      expect(host.calls).toContainEqual({
        route: "POST /v1/harnesses/detect",
        body: { harness: "claude-code", settingsFolder },
      });
    });
  });

  describe("a run", () => {
    it("names the session and the bridge by their ids, never the bridge's token", async () => {
      const host = hostWithHarnesses();
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      harness.start(task, hostSession(host), bridge);
      const stream = await opened;
      expect(stream.body).toEqual({ harness: "claude-code", task, session: "s1", bridge: "b1" });
      expect(JSON.stringify(host.calls)).not.toContain(bridge.token);
    });

    it("needs a session and a bridge open in the host", async () => {
      const host = hostWithHarnesses();
      const harness = await claudeCode(host);
      const elsewhere = { ...hostSession(host) } as never;
      expect(() => harness.start(task, elsewhere, bridge)).toThrow("must be open there");
      const otherBridge = { url: bridge.url, token: "another-made-up-token" };
      expect(() => harness.start(task, hostSession(host), otherBridge)).toThrow(
        "its bridge must be open there",
      );
    });

    it("gives each event in order and ends after finished", async () => {
      const host = hostWithHarnesses();
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      const run = harness.start(task, hostSession(host), bridge);
      const stream = await opened;
      const called = { type: "tool.called", agent: "writer", tool: "read", input: {} };
      stream.send({ type: "started", run: "r1" });
      stream.send({ type: "event", event: called });
      stream.send({ type: "event", event: finished });
      stream.send({ type: "finished" });
      expect(await collect(run)).toEqual([called, finished]);
    });

    it("fails with the host's message", async () => {
      const host = hostWithHarnesses();
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      const run = harness.start(task, hostSession(host), bridge);
      const stream = await opened;
      stream.send({ type: "started", run: "r1" });
      stream.send({ type: "failed", message: "Claude Code stopped with an error." });
      await expect(collect(run)).rejects.toThrow("Claude Code stopped with an error.");
    });

    it("fails when the stream stops without saying how the run ended", async () => {
      const host = hostWithHarnesses();
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      const run = harness.start(task, hostSession(host), bridge);
      const stream = await opened;
      stream.send({ type: "started", run: "r1" });
      stream.end();
      await expect(collect(run)).rejects.toMatchObject({ kind: "run_cut_off" });
    });

    it("fails with the host's refusal to start it", async () => {
      const host = hostWithHarnesses().refuseStream(
        "POST /v1/harnesses/runs/start",
        refused(404, "unknown_session", "The agent host has no open sandbox session with this id."),
      );
      const run = (await claudeCode(host)).start(task, hostSession(host), bridge);
      await expect(collect(run)).rejects.toMatchObject({ status: 404, kind: "unknown_session" });
      // It never started, so cancelling has nothing to stop.
      await expect(run.cancel()).resolves.toBeUndefined();
      await expect(run.send({ type: "answer", text: "yes" })).rejects.toMatchObject({
        kind: "unknown_session",
      });
    });

    it("sends a person's input to the run by its id", async () => {
      const host = hostWithHarnesses();
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      const run = harness.start(task, hostSession(host), bridge);
      (await opened).send({ type: "started", run: "r1" });
      const input = { type: "approval", callId: "call_1", approved: true } as const;
      await run.send(input);
      expect(host.calls).toContainEqual({
        route: "POST /v1/harnesses/runs/send",
        body: { run: "r1", input },
      });
    });

    it("fails a send the run refuses with the host's kind", async () => {
      const host = hostWithHarnesses().answer(
        "POST /v1/harnesses/runs/send",
        refused(409, "send_failed", "The run isn't waiting for an answer."),
      );
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      const run = harness.start(task, hostSession(host), bridge);
      (await opened).send({ type: "started", run: "r1" });
      await expect(run.send({ type: "answer", text: "yes" })).rejects.toMatchObject({
        status: 409,
        kind: "send_failed",
      });
    });

    it("cancels before its events are read, and resolves once the stream has ended", async () => {
      const host = hostWithHarnesses();
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      const run = harness.start(task, hostSession(host), bridge);
      const stream = await opened;
      await start(stream, "r1");
      let cancelled = false;
      const cancelling = run.cancel().then(() => {
        cancelled = true;
      });
      await expect
        .poll(() => host.calls)
        .toContainEqual({ route: "POST /v1/harnesses/runs/cancel", body: { run: "r1" } });
      expect(cancelled).toBe(false);
      stream.send({ type: "failed", message: "The run was cancelled." });
      await cancelling;
      expect(cancelled).toBe(true);
    });

    it("refuses send and cancel for a run whose stream ended before it started", async () => {
      const host = hostWithHarnesses();
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      const run = harness.start(task, hostSession(host), bridge);
      (await opened).send({ type: "finished" });
      expect(await collect(run)).toEqual([]);
      await expect(run.send({ type: "answer", text: "yes" })).rejects.toMatchObject({
        kind: "run_not_started",
      });
      await expect(run.cancel()).resolves.toBeUndefined();
    });

    it("hangs up at once when cancelled before the host has started it", async () => {
      const host = hostWithHarnesses();
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      const run = harness.start(task, hostSession(host), bridge);
      const stream = await opened;
      await expect(run.cancel()).resolves.toBeUndefined();
      expect(stream.signal.aborted).toBe(true);
      expect(host.calls.map((call) => call.route)).not.toContain("POST /v1/harnesses/runs/cancel");
    });

    it("counts a run the host no longer has as stopped", async () => {
      const host = hostWithHarnesses().answer(
        "POST /v1/harnesses/runs/cancel",
        refused(404, "unknown_run", "The agent host has no harness run with this id."),
      );
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      const run = harness.start(task, hostSession(host), bridge);
      const stream = await opened;
      stream.send({ type: "started", run: "r1" });
      stream.send({ type: "finished" });
      await expect(run.cancel()).resolves.toBeUndefined();
    });

    it("hangs up when the host can't be asked to cancel", async () => {
      const host = hostWithHarnesses().answer("POST /v1/harnesses/runs/cancel", () => {
        throw new Error("The agent host can't be reached.");
      });
      const harness = await claudeCode(host);
      const opened = host.nextStream("POST /v1/harnesses/runs/start");
      const run = harness.start(task, hostSession(host), bridge);
      const stream = await opened;
      await start(stream, "r1");
      await expect(run.cancel()).rejects.toThrow("can't be reached");
      expect(stream.signal.aborted).toBe(true);
    });
  });
});
