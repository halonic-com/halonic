import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Harness,
  HarnessBridge,
  HarnessDetectOptions,
  HarnessEvent,
  HarnessInput,
  HarnessRun,
  HarnessTask,
  SandboxSession,
} from "@halonicjs/ports";
import { afterEach, describe, expect, it } from "vitest";
import { BridgeTable } from "../bridge/bridge-routes.ts";
import { SessionTable } from "../sandbox/session-table.ts";
import { CallChannel } from "../server/call-channel.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import type { NdjsonStream } from "../server/ndjson-stream.ts";
import { harnessRoutes } from "./harness-routes.ts";
import { RunTable } from "./run-table.ts";

const token = randomLaunchToken();
/** The fake bridge's token. Not a real credential. */
const bridgeToken = "bridge-test-value";

const task: HarnessTask = {
  runId: "run_1",
  hubId: "hub_1",
  agentId: "writer",
  instructions: "",
  prompt: "Write a haiku.",
};

const finished: HarnessEvent = {
  type: "agent.finished",
  agent: "writer",
  status: "ok",
  output: "done",
} as HarnessEvent;

/** A run a test drives: it ends when the test says, and records what it was sent. */
class FakeRun implements HarnessRun {
  readonly sent: HarnessInput[] = [];
  cancelled = false;
  /** When set, `cancel` ends the run but then rejects with this error. */
  cancelError: Error | undefined;
  private readonly queue: (HarnessEvent | Error)[] = [];
  private wake: () => void = () => {};

  readonly session: SandboxSession;
  readonly bridge: HarnessBridge;

  constructor(session: SandboxSession, bridge: HarnessBridge) {
    this.session = session;
    this.bridge = bridge;
  }

  emit(item: HarnessEvent | Error): void {
    this.queue.push(item);
    this.wake();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<HarnessEvent> {
    for (;;) {
      const item = this.queue.shift();
      if (item === undefined) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
      } else if (item instanceof Error) {
        throw item;
      } else {
        yield item;
        if (item.type === "agent.finished") return;
      }
    }
  }

  async send(input: HarnessInput): Promise<void> {
    if (input.type === "approval") throw new Error("No approval with that id is waiting.");
    this.sent.push(input);
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    this.emit(new Error("The run was cancelled."));
    if (this.cancelError !== undefined) throw this.cancelError;
  }
}

const runs: FakeRun[] = [];
/** What each `detect()` was asked. */
const detected: HarnessDetectOptions[] = [];
const harness: Harness = {
  id: "fake",
  name: "Fake",
  detect: async (options = {}) => {
    detected.push(options);
    return { status: "ready", version: "1.0.0" };
  },
  start: (_task, session, bridge) => {
    const run = new FakeRun(session, bridge);
    runs.push(run);
    return run;
  },
};

let server: HostServer | undefined;
let runTable: RunTable;

afterEach(async () => {
  await runTable.cancelAll();
  await server?.close();
  server = undefined;
  runs.length = 0;
});

/** Starts the routes with one open session and one open bridge, and returns their ids. */
async function started(): Promise<{ url: string; session: string; bridge: string }> {
  const sessions = new SessionTable();
  const bridges = new BridgeTable();
  runTable = new RunTable();
  const openSession = {
    profile: { timeLimitMs: 60_000 },
    close: async () => {},
  } as SandboxSession;
  const session = (await sessions.add(openSession)) ?? "";
  const stream: NdjsonStream = { send: () => {}, end: () => {}, ended: new Promise(() => {}) };
  const bridge = bridges.add({
    bridge: { url: "http://127.0.0.1:4100", token: bridgeToken, close: async () => {} },
    channel: new CallChannel(stream),
    stream,
  });
  server = await startHostServer(
    token,
    harnessRoutes({ harnesses: [harness], sessions, bridges, runs: runTable }),
  );
  return { url: server.url, session, bridge };
}

function request(url: string, path: string, body?: unknown, signal?: AbortSignal) {
  return fetch(`${url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal === undefined ? {} : { signal }),
  });
}

async function* readLines(response: Response): AsyncGenerator<{ type: string; run?: string }> {
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of response.body as ReadableStream<Uint8Array>) {
    buffered += decoder.decode(chunk, { stream: true });
    for (let end = buffered.indexOf("\n"); end !== -1; end = buffered.indexOf("\n")) {
      yield JSON.parse(buffered.slice(0, end)) as { type: string };
      buffered = buffered.slice(end + 1);
    }
  }
}

/** Starts a run and returns its id, the fake behind it and the rest of its stream. */
async function startRun(
  url: string,
  ids: { session: string; bridge: string },
  signal?: AbortSignal,
) {
  const body = { harness: "fake", task, ...ids };
  const lines = readLines(await request(url, "/v1/harnesses/runs/start", body, signal));
  const first = (await lines.next()).value;
  return { id: first?.run ?? "", run: runs.at(-1) as FakeRun, lines };
}

async function rest(lines: AsyncGenerator<{ type: string }>): Promise<{ type: string }[]> {
  const all: { type: string }[] = [];
  for await (const line of lines) all.push(line);
  return all;
}

describe("harness routes", () => {
  it("lists the harnesses and answers detect, or 404 for one it doesn't have", async () => {
    const { url } = await started();
    expect(await (await request(url, "/v1/harnesses")).json()).toEqual([
      { id: "fake", name: "Fake" },
    ]);
    const detect = await request(url, "/v1/harnesses/detect", { harness: "fake" });
    expect(await detect.json()).toEqual({ status: "ready", version: "1.0.0" });
    const unknown = await request(url, "/v1/harnesses/detect", { harness: "other" });
    expect(unknown.status).toBe(404);
  });

  it("passes the agent's settings folder on to detect, and refuses one that isn't absolute", async () => {
    const { url } = await started();
    const settingsFolder = join(tmpdir(), "halonic-settings", "writer");
    await request(url, "/v1/harnesses/detect", { harness: "fake", settingsFolder });
    expect(detected).toContainEqual({ settingsFolder });
    const relative = { harness: "fake", settingsFolder: "settings/writer" };
    expect((await request(url, "/v1/harnesses/detect", relative)).status).toBe(400);
  });

  it("starts a run with the host's session and bridge and streams its events", async () => {
    const { url, ...ids } = await started();
    const { id, run, lines } = await startRun(url, ids);
    expect(id).not.toBe("");
    expect(run.bridge).toEqual({ url: "http://127.0.0.1:4100", token: bridgeToken });
    run.emit(finished);
    expect(await rest(lines)).toEqual([{ type: "event", event: finished }, { type: "finished" }]);
    const late = await request(url, "/v1/harnesses/runs/cancel", { run: id });
    expect(late.status).toBe(404);
  });

  it("passes an answer to the run, and says why when the run refuses one", async () => {
    const { url, ...ids } = await started();
    const { id, run } = await startRun(url, ids);
    const answer = { type: "answer", text: "yes" };
    const sent = await request(url, "/v1/harnesses/runs/send", { run: id, input: answer });
    expect(sent.status).toBe(200);
    expect(run.sent).toEqual([answer]);
    const approval = { type: "approval", callId: "call_9", approved: true };
    const refused = await request(url, "/v1/harnesses/runs/send", { run: id, input: approval });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: { kind: "send_failed" } });
  });

  it("ends the stream with failed when the run is cancelled", async () => {
    const { url, ...ids } = await started();
    const { id, run, lines } = await startRun(url, ids);
    expect((await request(url, "/v1/harnesses/runs/cancel", { run: id })).status).toBe(200);
    expect(run.cancelled).toBe(true);
    expect(await rest(lines)).toEqual([{ type: "failed", message: "The run was cancelled." }]);
  });

  it("cancels the run when Studio goes away", async () => {
    const { url, ...ids } = await started();
    const caller = new AbortController();
    const { run } = await startRun(url, ids, caller.signal);
    caller.abort();
    await expect.poll(() => run.cancelled).toBe(true);
  });

  it("keeps serving when the cancel after Studio went away rejects", async () => {
    const { url, ...ids } = await started();
    const caller = new AbortController();
    const { run } = await startRun(url, ids, caller.signal);
    run.cancelError = new Error("The harness process could not be stopped.");
    caller.abort();
    await expect.poll(() => run.cancelled).toBe(true);
    // An unhandled rejection would fail this test file; the host answers as before.
    expect((await request(url, "/v1/harnesses")).status).toBe(200);
  });

  it("refuses a session, bridge or harness the host doesn't have", async () => {
    const { url, session, bridge } = await started();
    for (const [body, kind] of [
      [{ harness: "fake", task, session: "other", bridge }, "unknown_session"],
      [{ harness: "fake", task, session, bridge: "other" }, "unknown_bridge"],
      [{ harness: "other", task, session, bridge }, "unknown_harness"],
    ] as const) {
      const answer = await request(url, "/v1/harnesses/runs/start", body);
      expect(answer.status).toBe(404);
      expect(await answer.json()).toMatchObject({ error: { kind } });
    }
  });

  it("cancels every run when the host stops, and starts no more", async () => {
    const { url, ...ids } = await started();
    const { run } = await startRun(url, ids);
    await runTable.cancelAll();
    expect(run.cancelled).toBe(true);
    const answer = await request(url, "/v1/harnesses/runs/start", {
      harness: "fake",
      task,
      ...ids,
    });
    expect(answer.status).toBe(503);
  });
});
