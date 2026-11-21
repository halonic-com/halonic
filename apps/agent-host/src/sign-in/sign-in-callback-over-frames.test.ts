import * as rig from "@halonicjs/testing-sign-in";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type FramedHostServer, serveHostOverFrames } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { TestRelay } from "../stdio/relay.test-helper.ts";
import { integrationSignInRoutes } from "./sign-in-routes.ts";
import { exampleSignInHost } from "./sign-in-test-kit.test-helper.ts";

const relayPort = 50_123;
const relayHost = `127.0.0.1:${relayPort}`;
const token = randomLaunchToken();

const withToken = {
  host: relayHost,
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};

let server: FramedHostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** The integration sign-in routes over the real sign-in host, served over frames as in `--stdio` mode. */
function served() {
  const example = exampleSignInHost(rig);
  const relay = new TestRelay();
  const routes = integrationSignInRoutes({ signIns: example.host, relayPort, log: () => {} });
  server = serveHostOverFrames(token, routes, relay.streams, relayPort);
  return { example, relay };
}

/** Starts the example sign-in through the relay and returns the provider's redirect back. */
async function approvedCallback({ example, relay }: ReturnType<typeof served>): Promise<URL> {
  const started = await relay.request("/v1/integrations/sign-in/start", {
    method: "POST",
    headers: withToken,
    body: JSON.stringify({ integration: "example", signIn: rig.signInName }),
  });
  expect(started.status).toBe(200);
  const { authorizeUrl } = JSON.parse(started.body) as { authorizeUrl: string };
  return example.server.approve(authorizeUrl);
}

async function status(relay: TestRelay): Promise<unknown> {
  const answer = await relay.request("/v1/integrations/sign-in/status", {
    method: "POST",
    headers: withToken,
    body: JSON.stringify({ integration: "example" }),
  });
  return JSON.parse(answer.body);
}

verifies("agent-host.integration-sign-in-routes", () => {
  describe("an integration's sign-in over frames", () => {
    it("sends the provider's redirect to the relay's port, and the callback without the token finishes it", async () => {
      const host = served();

      const callback = await approvedCallback(host);
      expect(callback.host).toBe(relayHost);
      expect(callback.pathname).toMatch(/^\/sign-in\/[A-Za-z0-9_-]{43}$/u);
      // The browser's request: no launch token, the relay's address.
      const page = await host.relay.request(callback.pathname + callback.search, {
        headers: { host: relayHost },
      });

      expect(page.status).toBe(200);
      expect(page.headers["connection"]).toBe("close");
      expect(await status(host.relay)).toMatchObject({
        signIns: [{ signIn: rig.signInName, state: "signedIn" }],
      });
    });

    it.each([
      ["another port", { host: "127.0.0.1:50124" }, 421],
      ["a rebound host name", { host: `attacker.example:${relayPort}` }, 421],
      ["a web page's origin", { host: relayHost, origin: "https://attacker.example" }, 403],
    ])("still refuses a callback with %s", async (_name, headers, status) => {
      const host = served();
      const callback = await approvedCallback(host);

      const page = await host.relay.request(callback.pathname + callback.search, { headers });

      expect(page.status).toBe(status);
    });
  });
});
