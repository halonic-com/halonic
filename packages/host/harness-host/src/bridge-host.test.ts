import type { BridgeRecorder, ModelPrice } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type BridgeAgent, type BridgeServices, LocalBridgeHost } from "./bridge-host.ts";
import { approveAll, harnessAgentOf, noTools, RecordingBridgeServer } from "./fakes.test-helper.ts";

const writer = harnessAgentOf("writer", "/data/proposals/01JD8Q");
const recorder: BridgeRecorder = { record: async () => {} };
const sonnetPrice: ModelPrice = { input: 3, output: 15 };

const services: BridgeServices = {
  providers: { anthropic: { kind: "key", secret: "anthropic-key" } },
  prices: { anthropic: { "claude-sonnet-5-5": sonnetPrice } },
  tools: noTools,
  approvals: approveAll,
};

function setup() {
  const server = new RecordingBridgeServer();
  const asked: BridgeAgent[] = [];
  const host = new LocalBridgeHost({
    server,
    services: {
      servicesFor: async (agent) => {
        asked.push(agent);
        return services;
      },
    },
  });
  return { server, asked, host };
}

verifies("harness-host.bridge", () => {
  it("opens the bridge for the agent's run with the services the host gives it", async () => {
    const { server, asked, host } = setup();

    const bridge = await host.open(writer, recorder);

    expect(bridge.url).toBe("http://127.0.0.1:4100");
    expect(asked).toEqual([{ runId: "01JD8Q", agentId: "writer" }]);
    const [options] = server.opened;
    expect(options).toMatchObject({
      runId: "01JD8Q",
      agentId: "writer",
      providers: services.providers,
      tools: noTools,
      approvals: approveAll,
    });
    expect(options?.recorder).toBe(recorder);
  });

  it("prices a model from the host's prices, and gives no price for one they don't name", async () => {
    const { server, host } = setup();

    await host.open(writer, recorder);

    const price = server.opened[0]?.price;
    expect(price?.("anthropic", "claude-sonnet-5-5")).toBe(sonnetPrice);
    expect(price?.("anthropic", "claude-haiku-4-5")).toBeNull();
    expect(price?.("openai", "gpt-5")).toBeNull();
    expect(price?.("anthropic", "toString")).toBeNull();
  });

  it("fails as the server fails when it can't listen", async () => {
    const host = new LocalBridgeHost({
      server: {
        open: async () => {
          throw new Error("Can't listen on loopback.");
        },
      },
      services: { servicesFor: () => services },
    });

    await expect(host.open(writer, recorder)).rejects.toThrow("Can't listen on loopback.");
  });
});
