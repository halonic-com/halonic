import type { BridgeEvent, BridgeRecorder } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agent, answersSent, hostAnswering, opened, services } from "./bridges.test-helper.ts";
import { AgentHostBridges } from "./bridges.ts";

const keyValue = "sk-acme-1234";

/** Opens `opening`'s bridge on a fake host whose recorder keeps what it records. */
async function openWith(opening: Parameters<AgentHostBridges["open"]>[0]) {
  const host = hostAnswering();
  const recorded: BridgeEvent[] = [];
  const events: BridgeRecorder = { record: async (event) => void recorded.push(event) };
  const bridges = new AgentHostBridges(host, {
    servicesFor: () => services(),
    scrub: (text) => text.replaceAll(keyValue, "[key]"),
  });
  const streamOpened = host.nextStream("POST /v1/bridge/open");
  const bridge = bridges.open(opening, events, "sandbox");
  const stream = await streamOpened;
  stream.send(opened);
  await bridge;
  return { host, stream, recorded };
}

/** Sends one `recorder.record` call and waits for Studio's answer. */
async function record(opening: Awaited<ReturnType<typeof openWith>>, params: object) {
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

verifies("agent-host-client.bridge-allowed", () => {
  it("tells the host the agent's asks and harness when its file names asks", async () => {
    const { host } = await openWith({ ...agent, file: { asks: "in-sandbox" } });

    expect(host.calls[0]?.body).toMatchObject({ asks: "in-sandbox", harness: "claude-code" });
  });

  it("tells the host neither when the file names no asks", async () => {
    const { host } = await openWith({ ...agent, file: { model: "claude-sonnet-5-5" } });

    expect(host.calls[0]?.body).not.toHaveProperty("asks");
    expect(host.calls[0]?.body).not.toHaveProperty("harness");
  });

  it("records a let-through call without the run token or a key Studio handed out", async () => {
    const opening = await openWith(agent);
    const detail = `curl -H 'x-api-key: ${keyValue}' -H 'token: ${opened.token}' .`;

    const answer = await record(opening, { ...allowed, detail });

    expect(answer).toEqual({ bridge: "b1", call: "1", result: null });
    expect(opening.recorded).toEqual([
      { ...allowed, detail: "curl -H 'x-api-key: [key]' -H 'token: [run token]' ." },
    ]);
  });

  it.each([
    ["another rule", { ...allowed, rule: "always" }],
    ["a cost", { ...allowed, cost: 1 }],
    [
      "no detail",
      { type: "harness.allowed", agent: "writer", tool: "Bash", rule: "asks-in-sandbox" },
    ],
  ])(
    "answers an error for a harness.allowed with %s, and records nothing",
    async (_what, event) => {
      const opening = await openWith(agent);

      const answer = await record(opening, event);

      expect(answer).toMatchObject({ error: expect.stringContaining("wrong shape") });
      expect(opening.recorded).toEqual([]);
    },
  );
});
