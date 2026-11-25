import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ServiceRegistry } from "@halonicjs/app";
import { OverviewMessagingService } from "@halonicjs/studio-feature-overview/api";
import { SearchMessagingService } from "@halonicjs/studio-feature-search/api";
import {
  ActiveAccountService,
  AgentActivityService,
  AgentMessagingService,
} from "@halonicjs/studio-services";
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

it("provides the active account with the scoped port, for every window to read", async () => {
  const services = new ServiceRegistry();
  provideAgentMessaging(services, recordingHost().transport, "/work/acme", new EventTarget());

  expect(services.get(ActiveAccountService).preferred()).toBeUndefined();
  // The three keys hold the one scoped port, not the host's own.
  expect(services.get(SearchMessagingService)).toBe(services.get(AgentMessagingService));
  expect(services.get(OverviewMessagingService)).toBe(services.get(AgentMessagingService));
  await services.dispose();
});

it("provides the activity panel's reads from the same host, for the workspace", async () => {
  const services = new ServiceRegistry();
  const bodies: unknown[] = [];
  const transport: AgentHostTransport = {
    request: async (route, body) => {
      bodies.push([route, body]);
      return { status: 200, body: { items: [] } };
    },
    stream: () => Promise.reject(new Error("No stream route is used here.")),
  };
  provideAgentMessaging(services, transport, "/work/acme", {});

  expect(await services.get(AgentActivityService).runs({})).toEqual([]);
  expect(bodies).toEqual([["POST /v1/messaging/runs", { workspace: "/work/acme" }]]);
});

it("provides no activity reads without an agent host", () => {
  const services = new ServiceRegistry();
  provideAgentMessaging(services, undefined, "/work/acme", {});

  expect(services.has(AgentActivityService)).toBe(false);
});
