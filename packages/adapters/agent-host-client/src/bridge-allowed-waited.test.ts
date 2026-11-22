import type { BridgeEvent, BridgeRecorder } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agent, answersSent, hostAnswering, opened, services } from "./bridges.test-helper.ts";
import { AgentHostBridges } from "./bridges.ts";

/** Opens the agent's bridge on a fake host whose recorder keeps what it records. */
async function openBridge() {
  const host = hostAnswering();
  const recorded: BridgeEvent[] = [];
  const events: BridgeRecorder = { record: async (event) => void recorded.push(event) };
  const bridges = new AgentHostBridges(host, { servicesFor: () => services() });
  const streamOpened = host.nextStream("POST /v1/bridge/open");
  const bridge = bridges.open(agent, events, "sandbox");
  const stream = await streamOpened;
  stream.send(opened);
  await bridge;
  return { host, stream, recorded };
}

/** Sends one `recorder.record` call and waits for Studio's answer. */
async function record(opening: Awaited<ReturnType<typeof openBridge>>, params: object) {
  opening.stream.send({ type: "call", call: "1", method: "recorder.record", params });
  await waitUntil("Studio to answer", () => answersSent(opening.host).length === 1);
  return answersSent(opening.host)[0];
}

const allowed = {
  type: "harness.allowed",
  agent: "writer",
  tool: "Bash",
  detail: "npm test",
  rule: "asks-in-sandbox",
};

verifies("agent-host-client.bridge-allowed-waited", () => {
  it("records a let-through call with how long the host took to answer", async () => {
    const opening = await openBridge();

    const answer = await record(opening, { ...allowed, waitedMs: 40 });

    expect(answer).toEqual({ bridge: "b1", call: "1", result: null });
    expect(opening.recorded).toEqual([{ ...allowed, waitedMs: 40 }]);
  });

  it.each([
    ["below 0", -1],
    ["not whole", 1.5],
    ["text", "40"],
  ])("answers an error for a waitedMs %s, and records nothing", async (_what, waitedMs) => {
    const opening = await openBridge();

    const answer = await record(opening, { ...allowed, waitedMs });

    expect(answer).toMatchObject({ error: expect.stringContaining("wrong shape") });
    expect(opening.recorded).toEqual([]);
  });
});
