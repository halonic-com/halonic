import type { BridgeRecorder, HarnessBridgeServer, ModelPrice } from "@halonicjs/ports";
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
    servers: { sandbox: server, "this-computer": server },
    services: {
      servicesFor: async (agent) => {
        asked.push(agent);
        return services;
      },
    },
    reportError: () => {},
  });
  return { server, asked, host };
}

verifies("harness-host.bridge", () => {
  it("opens the bridge for the agent's run with the services the host gives it", async () => {
    const { server, asked, host } = setup();

    const bridge = await host.open(writer, recorder, "sandbox");

    expect(bridge.url).toBe("http://127.0.0.1:4100");
    expect(asked).toEqual([
      { runId: "01JD8Q", agentId: "writer", harness: "claude-code", hubId: "support" },
    ]);
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

  it("tells the engine how the bridge reaches each provider, and closes the server's bridge", async () => {
    const { server, host } = setup();

    const bridge = await host.open(writer, recorder, "sandbox");
    await bridge.close();

    expect(bridge.providers).toBe(services.providers);
    expect(bridge.token).toBe("test-token");
    expect(server.closed).toBe(1);
  });

  it("prices a model from the host's prices, and gives no price for one they don't name", async () => {
    const { server, host } = setup();

    await host.open(writer, recorder, "sandbox");

    const price = server.opened[0]?.price;
    expect(price?.("anthropic", "claude-sonnet-5-5")).toBe(sonnetPrice);
    expect(price?.("anthropic", "claude-haiku-4-5")).toBeNull();
    expect(price?.("openai", "gpt-5")).toBeNull();
    expect(price?.("anthropic", "toString")).toBeNull();
  });

  it("fails as the server fails when it can't listen", async () => {
    const deaf: HarnessBridgeServer = {
      open: async () => {
        throw new Error("Can't listen on loopback.");
      },
    };
    const host = new LocalBridgeHost({
      servers: { sandbox: deaf, "this-computer": deaf },
      services: { servicesFor: () => services },
      reportError: () => {},
    });

    await expect(host.open(writer, recorder, "sandbox")).rejects.toThrow(
      "Can't listen on loopback.",
    );
  });
});

verifies("harness-host.bridge-agent-model", () => {
  it("tells the host the agent's hub and no model when the agent's file names none", async () => {
    const { asked, host } = setup();

    await host.open(writer, recorder, "sandbox");

    expect(asked).toEqual([
      { runId: "01JD8Q", agentId: "writer", harness: "claude-code", hubId: "support" },
    ]);
  });

  it("tells the host the agent file's model as written, so it can resolve an alias", async () => {
    const { asked, host } = setup();
    const openCoder = { ...writer, file: { ...writer.file, model: "open-coder-agent" } };

    await host.open(openCoder, recorder, "sandbox");

    expect(asked).toEqual([
      {
        runId: "01JD8Q",
        agentId: "writer",
        harness: "claude-code",
        hubId: "support",
        model: "open-coder-agent",
      },
    ]);
  });
});

verifies("harness-host.bridge-agent-harness", () => {
  it("tells the host the harness the agent's call runs in", async () => {
    const { asked, host } = setup();
    const codexWriter = { ...writer, harness: "codex" as const };

    await host.open(codexWriter, recorder, "sandbox");

    expect(asked.map((agent) => agent.harness)).toEqual(["codex"]);
  });
});

verifies("harness-host.bridge-placement", () => {
  it("opens a run's bridge on the server for the placement the engine names", async () => {
    const fenced = new RecordingBridgeServer();
    const unfenced = new RecordingBridgeServer();
    const host = new LocalBridgeHost({
      servers: { sandbox: fenced, "this-computer": unfenced },
      services: { servicesFor: () => services },
      reportError: () => {},
    });

    await host.open(writer, recorder, "this-computer");
    await host.open(writer, recorder, "sandbox");

    expect(unfenced.opened).toHaveLength(1);
    expect(fenced.opened).toHaveLength(1);
  });
});
