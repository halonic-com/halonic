import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeRun, send } from "./fakes.test-helper.ts";
import { NodeHarnessBridgeServer } from "./server.ts";

verifies("harness-bridge.server", () => {
  it("opens a bridge per run that serves only requests with its token", async () => {
    const secrets = { get: async () => null };
    const server = new NodeHarnessBridgeServer({ secrets, limits: { maxBytes: 1024 } });
    const bridge = await server.open(fakeRun());
    try {
      expect((await send(bridge, "/v1/messages")).status).toBe(401);
      expect((await send(bridge, "/v1/responses", { token: bridge.token })).status).toBe(404);
    } finally {
      await bridge.close();
    }
  });

  it.each([Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY])(
    "refuses %s as the close time limit",
    (closeTimeoutMs) => {
      const secrets = { get: async () => null };
      expect(() => new NodeHarnessBridgeServer({ secrets, closeTimeoutMs })).toThrow(
        expect.objectContaining({ kind: "invalid_input" }),
      );
    },
  );
});

verifies("harness-bridge.anthropic", () => {
  it("serves Anthropic's messages path", async () => {
    const secrets = { get: async () => null };
    const server = new NodeHarnessBridgeServer({ secrets });
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
