import type {
  BridgeApprovalDecision,
  BridgeApprovals,
  Harness,
  HarnessBridgeOptions,
  HarnessRun,
  HarnessTask,
  SandboxFence,
  SandboxSession,
} from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { harnessRoutes } from "../harness/harness-routes.ts";
import { RunTable } from "../harness/run-table.ts";
import { SessionTable } from "../sandbox/session-table.ts";
import type { ChannelCallLine } from "../server/call-channel.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { BridgeTable, bridgeRoutes } from "./bridge-routes.ts";
import type { OpenBridgeBody } from "./bridge-schemas.ts";

const token = randomLaunchToken();
const workingFolder = "/data/proposals/01JD8Q/files/agents/writer";
const edit = { file_path: `${workingFolder}/reply.md` };
const openBody: OpenBridgeBody = { runId: "run_1", agentId: "writer", providers: {}, prices: {} };
const inSandbox = { ...openBody, asks: "in-sandbox", harness: "claude-code" } as const;
const task: HarnessTask = {
  runId: "run_1",
  hubId: "hub_1",
  agentId: "writer",
  instructions: "",
  prompt: "Write a haiku.",
};

/** How many runs the harness started since the test began. */
let starts = 0;

/** A harness whose runs end only when cancelled. */
const harness: Harness = {
  id: "fake",
  name: "Fake",
  detect: async () => ({ status: "ready", version: "1.0.0" }),
  start: (): HarnessRun => {
    starts += 1;
    let cancel: () => void = () => {};
    const cancelled = new Promise<void>((resolve) => {
      cancel = resolve;
    });
    return {
      // No events: the run's stream ends when it is cancelled.
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          await cancelled;
          return { done: true, value: undefined };
        },
      }),
      send: async () => {},
      cancel: async () => cancel(),
    };
  },
};

let server: HostServer | undefined;
let bridges: BridgeTable;
let runs: RunTable;
const stopped: AbortController[] = [];

afterEach(async () => {
  for (const each of stopped.splice(0)) each.abort();
  await runs.cancelAll();
  await bridges.closeAll();
  await server?.close();
  server = undefined;
});

/**
 * The host's bridge and harness routes on one sandbox session with `fence`,
 * a bridge server that keeps the approvals each bridge is opened with, and
 * paths that resolve as written.
 */
async function startedWith(fence: SandboxFence) {
  const sessions = new SessionTable();
  bridges = new BridgeTable();
  runs = new RunTable();
  starts = 0;
  const opened: BridgeApprovals[] = [];
  const serverFor = () => ({
    open: async (options: HarnessBridgeOptions) => {
      opened.push(options.approvals);
      return { url: "http://127.0.0.1:4100", token: "bridge-test-value", close: async () => {} };
    },
  });
  const paths = {
    resolve: async (path: string) => ({ real: path, linked: false }),
    windows: false,
  };
  server = await startHostServer(token, [
    ...bridgeRoutes(serverFor, bridges, undefined, paths),
    ...harnessRoutes({ harnesses: [harness], sessions, bridges, runs }),
  ]);
  const addSession = async (sessionFence: SandboxFence) => {
    const profile = { workingFolder, timeLimitMs: 60_000 };
    const session = { fence: sessionFence, profile, close: async () => {} };
    return (await sessions.add(session as unknown as SandboxSession)) ?? "";
  };
  return { url: server.url, sessionId: await addSession(fence), opened, addSession };
}

function post(url: string, path: string, body: unknown, signal: AbortSignal): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/** Opens a bridge as Studio does, whose approvals refuse; returns its id and the calls Studio got. */
async function openAsStudio(url: string, body: OpenBridgeBody) {
  const stop = new AbortController();
  stopped.push(stop);
  const lines = readLines(await post(url, "/v1/bridge/open", body, stop.signal));
  const first = (await lines.next()).value as { bridge: string };
  const calls: ChannelCallLine[] = [];
  void (async () => {
    for await (const line of lines) {
      const call = line as ChannelCallLine;
      if (call.type !== "call") continue;
      calls.push(call);
      const refused: BridgeApprovalDecision = { approved: false };
      const result = call.method === "approvals.request" ? refused : null;
      await post(
        url,
        "/v1/bridge/answer",
        { bridge: first.bridge, call: call.call, result },
        stop.signal,
      );
    }
  })().catch(() => {});
  return { bridge: first.bridge, calls };
}

/**
 * Starts a run on `bridge` in the session, and waits until the host says it started.
 *
 * @returns the host's answer, whose body is read only when it isn't a stream
 */
async function startRun(url: string, sessionId: string, bridge: string): Promise<Response> {
  const stop = new AbortController();
  stopped.push(stop);
  const body = { harness: "fake", task, session: sessionId, bridge };
  const response = await post(url, "/v1/harnesses/runs/start", body, stop.signal);
  if (response.ok) await readLines(response).next();
  return response;
}

async function* readLines(response: Response): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of response.body as ReadableStream<Uint8Array>) {
    buffered += decoder.decode(chunk, { stream: true });
    for (let end = buffered.indexOf("\n"); end !== -1; end = buffered.indexOf("\n")) {
      yield JSON.parse(buffered.slice(0, end)) as unknown;
      buffered = buffered.slice(end + 1);
    }
  }
}

/** Asks the bridge's approvals for an edit, as Claude Code's own tool does. */
function askEdit(approvals: BridgeApprovals | undefined) {
  return approvals?.request(
    { callId: "c1", tool: "Edit", args: edit },
    { signal: new AbortController().signal },
  );
}

verifies("agent-host.sandboxed-asks", () => {
  it("lets an edit in the working folder through, fenced, and tells Studio's run log", async () => {
    const { url, sessionId, opened } = await startedWith({ state: "fenced" });
    const studio = await openAsStudio(url, inSandbox);
    await startRun(url, sessionId, studio.bridge);

    const answer = await askEdit(opened[0]);

    expect(answer).toEqual({ approved: true });
    await waitUntil("Studio to get the record", () => studio.calls.length === 1);
    expect(studio.calls).toMatchObject([
      {
        method: "recorder.record",
        params: {
          type: "harness.allowed",
          agent: "writer",
          tool: "Edit",
          detail: edit.file_path,
          rule: "asks-in-sandbox",
        },
      },
    ]);
  });

  it("asks Studio before any run started on the bridge", async () => {
    const { url, opened } = await startedWith({ state: "fenced" });
    const studio = await openAsStudio(url, inSandbox);

    expect(await askEdit(opened[0])).toEqual({ approved: false });
    expect(studio.calls.map((call) => call.method)).toEqual(["approvals.request"]);
  });

  it("asks Studio in a run whose session isn't fenced", async () => {
    const { url, sessionId, opened } = await startedWith({ state: "not-fenced", reason: "probe" });
    const studio = await openAsStudio(url, inSandbox);
    await startRun(url, sessionId, studio.bridge);

    expect(await askEdit(opened[0])).toEqual({ approved: false });
    expect(studio.calls.map((call) => call.method)).toEqual(["approvals.request"]);
  });

  it.each([
    ["without asks", openBody],
    ["with asks but no harness", { ...openBody, asks: "in-sandbox" as const }],
  ])("asks Studio for a bridge opened %s, even fenced", async (_what, body) => {
    const { url, sessionId, opened } = await startedWith({ state: "fenced" });
    const studio = await openAsStudio(url, body);
    await startRun(url, sessionId, studio.bridge);

    expect(await askEdit(opened[0])).toEqual({ approved: false });
    expect(studio.calls.map((call) => call.method)).toEqual(["approvals.request"]);
  });

  it("refuses a run on a bridge a run started in another session, and keeps the first fence", async () => {
    const { url, sessionId, opened, addSession } = await startedWith({
      state: "not-fenced",
      reason: "probe",
    });
    const fencedId = await addSession({ state: "fenced" });
    const studio = await openAsStudio(url, inSandbox);
    await startRun(url, sessionId, studio.bridge);

    const second = await startRun(url, fencedId, studio.bridge);

    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: { kind: "bridge_in_use" } });
    expect(starts).toBe(1);
    expect(await askEdit(opened[0])).toEqual({ approved: false });
    expect(studio.calls.map((call) => call.method)).toEqual(["approvals.request"]);
  });

  it("starts a second run on the bridge in the same session", async () => {
    const { url, sessionId } = await startedWith({ state: "fenced" });
    const studio = await openAsStudio(url, inSandbox);
    await startRun(url, sessionId, studio.bridge);

    const second = await startRun(url, sessionId, studio.bridge);

    expect(second.status).toBe(200);
  });
});
