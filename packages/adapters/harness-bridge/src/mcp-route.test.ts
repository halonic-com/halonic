import {
  type BridgeApprovals,
  type BridgeEvent,
  type BridgeToolCheck,
  harnessBridgeTokenHeader,
  type OpenHarnessBridge,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { fakeRun } from "./fakes.test-helper.ts";
import { NodeHarnessBridgeServer } from "./server.ts";

const opened: OpenHarnessBridge[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((bridge) => bridge.close()));
});

/** How the run's check and approvals answer; each part left out lets the call run. */
interface RunWith {
  check?: BridgeToolCheck;
  approvals?: BridgeApprovals;
  signal?: AbortSignal;
}

/** A bridge whose run offers one tool, `read_issue`, and keeps what it records and runs. */
async function openWithTools(run: RunWith = {}) {
  const recorded: BridgeEvent[] = [];
  const ran: string[] = [];
  const server = new NodeHarnessBridgeServer({ secrets: { get: async () => null } });
  const bridge = await server.open({
    ...fakeRun(run.signal),
    recorder: { record: async (event) => void recorded.push(event) },
    tools: {
      list: async () => [{ name: "read_issue", description: "Reads one issue.", parameters: {} }],
      check: async () => run.check ?? { kind: "run" },
      call: async (name) => {
        ran.push(name);
        return { result: "issue 3 is open", outcome: "ok" };
      },
    },
    ...(run.approvals === undefined ? {} : { approvals: run.approvals }),
  });
  opened.push(bridge);
  return { bridge, recorded, ran };
}

const callReadIssue = {
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: { name: "read_issue", arguments: { number: 3 } },
};

/** Sends one MCP message as Claude Code does, with the run token. */
async function post(
  bridge: OpenHarnessBridge,
  message: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${bridge.url}/mcp`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(message),
  });
  return {
    status: response.status,
    type: response.headers.get("content-type"),
    text: await response.text(),
  };
}

verifies("harness-bridge.mcp", () => {
  it("initializes, lists and calls the run's tools over HTTP", async () => {
    const { bridge, recorded } = await openWithTools();
    const initialized = await post(bridge, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "claude-code" },
      },
    });
    expect(initialized.status).toBe(200);
    expect(initialized.type).toBe("application/json");
    expect(JSON.parse(initialized.text)).toMatchObject({
      id: 1,
      result: { protocolVersion: "2025-06-18" },
    });

    const notified = await post(bridge, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(notified).toMatchObject({ status: 202, text: "" });

    const version = { "mcp-protocol-version": "2025-06-18" };
    const listed = await post(bridge, { jsonrpc: "2.0", id: 2, method: "tools/list" }, version);
    expect(JSON.parse(listed.text)).toMatchObject({ result: { tools: [{ name: "read_issue" }] } });

    const called = await post(
      bridge,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "read_issue", arguments: {} },
      },
      version,
    );
    expect(JSON.parse(called.text)).toMatchObject({
      id: 3,
      result: { content: [{ type: "text", text: "issue 3 is open" }], isError: false },
    });
    expect(recorded.map((event) => event.type)).toEqual(["tool.called", "tool.result"]);
    for (const reply of [initialized, listed, called])
      expect(reply.text).not.toContain(bridge.token);
  });

  it("refuses an MCP version it doesn't speak with a 400", async () => {
    const { bridge } = await openWithTools();
    const reply = await post(
      bridge,
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { "mcp-protocol-version": "1999-01-01" },
    );
    expect(reply.status).toBe(400);
    expect(reply.text).not.toContain(bridge.token);
  });

  it("answers a GET with 405, since it sends no messages of its own", async () => {
    const { bridge } = await openWithTools();
    const response = await fetch(`${bridge.url}/mcp`, {
      headers: { [harnessBridgeTokenHeader]: bridge.token, accept: "text/event-stream" },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("answers 401 without the run token", async () => {
    const { bridge } = await openWithTools();
    const response = await fetch(`${bridge.url}/mcp`, { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
  });
});

verifies("harness-bridge.approvals", () => {
  it("waits for a person's OK through the run's approvals, then runs the call", async () => {
    const { bridge, ran } = await openWithTools({
      check: { kind: "ask" },
      approvals: { request: async () => ({ approved: true }) },
    });
    const called = await post(bridge, callReadIssue);
    expect(JSON.parse(called.text)).toMatchObject({ result: { isError: false } });
    expect(ran).toEqual(["read_issue"]);
  });

  it("ends the wait when the run ends, and doesn't run the call", async () => {
    const run = new AbortController();
    let waiting: (signal: AbortSignal) => void = () => {};
    const asked = new Promise<AbortSignal>((resolve) => {
      waiting = resolve;
    });
    const { bridge, ran, recorded } = await openWithTools({
      check: { kind: "ask" },
      signal: run.signal,
      approvals: {
        // Like the engine's: rejects once the signal aborts, and not before.
        request: (_request, { signal }) => {
          waiting(signal);
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      },
    });
    const called = post(bridge, callReadIssue).catch(() => "the reply broke off");
    const waitSignal = await asked;
    expect(waitSignal.aborted).toBe(false);

    run.abort();
    await bridge.close();
    expect(waitSignal.aborted).toBe(true);
    await called;
    expect(ran).toEqual([]);
    expect(recorded).toEqual([]);
  });
});
