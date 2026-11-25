import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ServiceRegistry } from "@halonicjs/app";
import { expect, it } from "vitest";
import { provideAgentMessaging } from "./provide-agent-messaging.ts";

/** A host that answers every call with nothing and records each route it was asked. */
function recordingHost(): { transport: AgentHostTransport; routes: string[] } {
  const routes: string[] = [];
  const transport: AgentHostTransport = {
    request: async (route) => {
      routes.push(route);
      return { status: 200, body: {} };
    },
    stream: () => Promise.reject(new Error("No stream route is used here.")),
  };
  return { transport, routes };
}

it("stops telling the host about the window once the folder's services are disposed", async () => {
  const services = new ServiceRegistry();
  const { transport, routes } = recordingHost();
  const window = new EventTarget();
  provideAgentMessaging(services, transport, "/work/acme", window);

  window.dispatchEvent(new Event("focus"));
  await services.dispose();
  window.dispatchEvent(new Event("blur"));
  window.dispatchEvent(new Event("focus"));
  await Promise.resolve();

  expect(routes).toEqual(["POST /v1/messaging/focus"]);
});
