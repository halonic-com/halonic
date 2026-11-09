import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeRun, send } from "./fakes.test-helper.ts";
import { NodeHarnessBridgeServer } from "./server.ts";

verifies("harness-bridge.server", () => {
  it("opens a bridge per run that serves only requests with its token", async () => {
    const server = new NodeHarnessBridgeServer({ limits: { maxBytes: 1024 } });
    const bridge = await server.open(fakeRun());
    try {
      expect((await send(bridge, "/v1/messages")).status).toBe(401);
      // No route is served yet: the model gateway and MCP come in the next pull requests.
      expect((await send(bridge, "/v1/messages", { token: bridge.token })).status).toBe(404);
    } finally {
      await bridge.close();
    }
  });
});
