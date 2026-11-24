import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { pluginToolsRoute } from "./plugin-tools-route.ts";

const token = randomLaunchToken();

let server: HostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function ask(inThisBuild: boolean, authorization = `Bearer ${token}`) {
  server = await startHostServer(token, [pluginToolsRoute(inThisBuild)]);
  const response = await fetch(`${server.url}/v1/plugins/tools`, { headers: { authorization } });
  return { status: response.status, body: (await response.json()) as unknown };
}

verifies("agent-host.plugin-tools-in-build", () => {
  describe("GET /v1/plugins/tools", () => {
    it("answers that this build runs plugin tools", async () => {
      expect(await ask(true)).toEqual({ status: 200, body: { inThisBuild: true } });
    });

    it("answers that this build has none", async () => {
      expect(await ask(false)).toEqual({ status: 200, body: { inThisBuild: false } });
    });

    it("answers 401 without the launch token", async () => {
      expect((await ask(false, "Bearer wrong")).status).toBe(401);
    });
  });
});
