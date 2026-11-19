import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { hostAnswering, opened, recorder, services } from "./bridges.test-helper.ts";
import { AgentHostBridges, type BridgeAgent, type OpeningAgent } from "./bridges.ts";

/** Opens a bridge for `agent` and gives what Studio's `servicesFor` was told. */
async function toldFor(agent: OpeningAgent): Promise<BridgeAgent[]> {
  const host = hostAnswering();
  const told: BridgeAgent[] = [];
  const bridges = new AgentHostBridges(host, {
    servicesFor: (asked) => {
      told.push(asked);
      return services();
    },
  });
  const streamOpened = host.nextStream("POST /v1/bridge/open");
  const opening = bridges.open(agent, recorder);
  const stream = await streamOpened;
  stream.send(opened);
  const bridge = await opening;
  stream.end();
  await bridge.close();
  return told;
}

verifies("agent-host-client.bridge-agent-model", () => {
  it("tells Studio the agent's hub and its file's model as written", async () => {
    const told = await toldFor({
      runId: "run-1",
      agentId: "writer",
      hubId: "acme",
      file: { model: "open-coder-agent" },
    });

    expect(told).toEqual([
      { runId: "run-1", agentId: "writer", hubId: "acme", model: "open-coder-agent" },
    ]);
  });

  it("names no model when the agent's file names none, and nothing else of the engine's agent", async () => {
    const engineAgent = {
      runId: "run-1",
      agentId: "writer",
      hubId: "acme",
      file: {},
      filesFolder: "/x",
    };

    const told = await toldFor(engineAgent);

    expect(told).toEqual([{ runId: "run-1", agentId: "writer", hubId: "acme" }]);
  });
});
