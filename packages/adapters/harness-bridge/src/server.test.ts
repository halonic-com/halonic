import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun, noOutsideCall, send } from "./fakes.test-helper.ts";
import { socketBridgeName } from "./listener.ts";
import { sendToSocket } from "./raw-client.test-helper.ts";
import { NodeHarnessBridgeServer } from "./server.ts";

verifies("harness-bridge.server", () => {
  it("opens a bridge per run that serves only requests with its token", async () => {
    const secrets = { get: async () => null };
    const server = new NodeHarnessBridgeServer({
      secrets,
      fetch: noOutsideCall,
      limits: { maxBytes: 1024 },
    });
    const bridge = await server.open(fakeRun());
    try {
      expect((await send(bridge, "/v1/messages")).status).toBe(401);
      expect((await send(bridge, "/v1/chat/completions", { token: bridge.token })).status).toBe(
        404,
      );
    } finally {
      await bridge.close();
    }
  });

  it.each([Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY])(
    "refuses %s as the close time limit",
    (closeTimeoutMs) => {
      const secrets = { get: async () => null };
      expect(
        () => new NodeHarnessBridgeServer({ secrets, fetch: noOutsideCall, closeTimeoutMs }),
      ).toThrow(expect.objectContaining({ kind: "invalid_input" }));
    },
  );
});

verifies("harness-bridge.socket", () => {
  it("serves each run on a socket of its own when given a socket folder", async () => {
    const folder = await mkdtemp(join(tmpdir(), "bridges-"));
    const secrets = { get: async () => null };
    const server = new NodeHarnessBridgeServer({
      secrets,
      fetch: noOutsideCall,
      socketFolder: folder,
    });
    try {
      const bridge = await server.open(fakeRun());
      const reply = await sendToSocket(bridge.socketPath ?? "", {
        target: "/v1/messages",
        host: socketBridgeName,
      });
      await bridge.close();

      expect(bridge.url).toBe("http://bridge.halonic.invalid");
      expect(reply.status).toBe(401);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

verifies("harness-bridge.anthropic", () => {
  it("serves Anthropic's messages path", async () => {
    const secrets = { get: async () => null };
    const server = new NodeHarnessBridgeServer({ secrets, fetch: noOutsideCall });
    const bridge = await server.open(fakeRun());
    try {
      // The run's agent doesn't use Anthropic: the route is there and refuses it.
      const reply = await send(bridge, "/v1/messages", { token: bridge.token, body: "{}" });
      expect(reply.status).toBe(403);
    } finally {
      await bridge.close();
    }
  });
});

verifies("harness-bridge.openai", () => {
  it("serves OpenAI's responses path", async () => {
    const secrets = { get: async () => null };
    const server = new NodeHarnessBridgeServer({ secrets, fetch: noOutsideCall });
    const bridge = await server.open(fakeRun());
    try {
      // The run's agent doesn't use OpenAI: the route is there and refuses it.
      const reply = await send(bridge, "/v1/responses", { token: bridge.token, body: "{}" });
      expect(reply.status).toBe(403);
    } finally {
      await bridge.close();
    }
  });
});

verifies("harness-bridge.provider-base-url", () => {
  it("calls a baseUrl through compatibleFetch, never through fetch", async () => {
    const secrets = { get: async () => "compatible-test-value" };
    const ownHosts = fakeProvider(() => Response.json({ output: [] }));
    const compatible = fakeProvider(() => Response.json({ output: [] }));
    const server = new NodeHarnessBridgeServer({
      secrets,
      fetch: ownHosts.fetch,
      compatibleFetch: compatible.fetch,
    });
    const openai = {
      kind: "key",
      secret: "k",
      baseUrl: "https://compatible.example/v1",
      models: ["glm-5.2"],
    } as const;
    const recorder = { record: async () => {} };
    const bridge = await server.open({ ...fakeRun(), providers: { openai }, recorder });
    try {
      const body = JSON.stringify({ model: "glm-5.2", input: "hi" });
      expect((await send(bridge, "/v1/responses", { token: bridge.token, body })).status).toBe(200);
      expect(compatible.calls.map((call) => call.url)).toEqual([
        "https://compatible.example/v1/responses",
      ]);
      expect(ownHosts.calls).toEqual([]);
    } finally {
      await bridge.close();
    }
  });
});
