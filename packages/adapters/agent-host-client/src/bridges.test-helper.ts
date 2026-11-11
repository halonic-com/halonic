// Shared by the bridge tests: services that answer nothing, a host that
// takes every answer, and a bridge opened on it.
import type {
  BridgeApprovals,
  BridgeRecorder,
  BridgeTools,
  OpenHarnessBridge,
} from "@halonicjs/ports";
import { AgentHostBridges, type BridgeServices } from "./bridges.ts";
import { FakeHost, type FakeStream, ok } from "./fake-host.test-helper.ts";

export const agent = { runId: "run-1", agentId: "writer" };
export const opened = {
  type: "opened",
  bridge: "b1",
  url: "http://127.0.0.1:41817",
  token: "run-token",
};

/** Services that answer nothing; each test sets the one it calls. */
export function services(overrides: Partial<BridgeServices> = {}): BridgeServices {
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

export const recorder: BridgeRecorder = { record: async () => {} };

export function hostAnswering(): FakeHost {
  return new FakeHost()
    .answer("POST /v1/bridge/answer", ok({ answered: true }))
    .answer("POST /v1/bridge/close", ok({ closed: true }));
}

/** Opens a bridge on `host`, whose stream sends `opened` first. */
export async function openOn(
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

export function answersSent(host: FakeHost): unknown[] {
  return host.calls
    .filter((call) => call.route === "POST /v1/bridge/answer")
    .map((call) => call.body);
}
