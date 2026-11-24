import { AgentHostMessaging, type AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import type { ServiceRegistry } from "@halonicjs/app";
import { AgentMessagingService } from "@halonicjs/studio-services";

/**
 * Provides the desktop engine's `AgentMessaging` for the open workspace
 * (ADR 2026-11-24, agent messaging, deployment (a)): the agent host runs the
 * providers and holds their keys, and the Inbox, Messenger and overview read
 * it through `AgentMessagingService` without knowing which engine serves it.
 * It also tells the host when the window comes to the front or goes to the
 * back, so the host polls every 30 seconds or every 5 minutes. Without an
 * agent host nothing is provided, and the features show no agent items.
 *
 * @param location - the workspace's real path, which the host binds keys to
 */
export function provideAgentMessaging(
  services: ServiceRegistry,
  transport: AgentHostTransport | undefined,
  location: string,
  window: object,
): void {
  if (transport === undefined) return;
  const messaging = new AgentHostMessaging(transport, location);
  services.provide(AgentMessagingService, messaging);
  if (!(window instanceof EventTarget)) return;
  const tell = (inFront: boolean) => () => {
    messaging.setInFront(inFront).catch((error: unknown) => {
      console.error("Telling the agent host whether the window is in front", error);
    });
  };
  window.addEventListener("focus", tell(true));
  window.addEventListener("blur", tell(false));
}
