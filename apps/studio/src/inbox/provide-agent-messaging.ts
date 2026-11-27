import {
  AgentHostActivity,
  AgentHostMessaging,
  AgentHostReactions,
  AgentHostSyncDiagnostics,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { MemoryHostSettingsStore } from "@halonicjs/adapter-memory";
import type { Disposable, ServiceRegistry } from "@halonicjs/app";
import { OverviewMessagingService } from "@halonicjs/studio-feature-overview/api";
import { SearchMessagingService } from "@halonicjs/studio-feature-search/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import {
  ActiveAccountService,
  AgentActivityService,
  AgentMessagingService,
  HostActiveAccount,
  MessageReactionsService,
  SharedChanges,
  SyncDiagnosticsService,
  scopeToAccount,
} from "@halonicjs/studio-services";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import { provideActionSteppers } from "./provide-action-steppers.ts";

/** The window listeners that tell the host whether the window is in front; the folder's registry removes them when it closes. */
export const agentMessagingFocusKey: ServiceKey<Disposable> = serviceKey<Disposable>(
  "studio.agent-messaging-focus",
);

/**
 * Provides the desktop engine's `AgentMessaging` for the open workspace
 * (ADR 2026-11-24, agent messaging, deployment (a)): the agent host runs the
 * providers and holds their keys, and the Inbox, Messenger and overview read
 * it through `AgentMessagingService` without knowing which engine serves it.
 * Search and the overview with its daily recap read the same one through
 * their own keys. All of them see only the active account's sources.
 * The Messenger's activity panel reads the same host's runs and pull
 * requests through `AgentActivityService`, Settings › Sync diagnostics
 * its sync counters through `SyncDiagnosticsService`, and the reactions on
 * a chat's messages through `MessageReactionsService`.
 * It also tells the host when the window comes to the front or goes to the
 * back, so the host polls every 30 seconds or every 5 minutes. Without an
 * agent host nothing is provided, and the features show no agent items.
 * Closing the folder removes the window listeners, so a closed folder tells
 * the host nothing.
 *
 * @param location - the workspace's real path, which the host binds keys to
 */
export function provideAgentMessaging(
  services: ServiceRegistry,
  transport: AgentHostTransport | undefined,
  location: string,
  window: object,
): void {
  const messaging = provideAgentMessagingReaders(services, transport, location);
  if (messaging === undefined || !(window instanceof EventTarget)) return;
  const tell = (inFront: boolean) => () => {
    messaging.setInFront(inFront).catch((error: unknown) => {
      console.error("Telling the agent host whether the window is in front", error);
    });
  };
  const focused = tell(true);
  const blurred = tell(false);
  window.addEventListener("focus", focused);
  window.addEventListener("blur", blurred);
  services.provide(agentMessagingFocusKey, {
    dispose: () => {
      window.removeEventListener("focus", focused);
      window.removeEventListener("blur", blurred);
    },
  });
}

/**
 * Provides what {@link provideAgentMessaging} provides, but tells the host nothing about the
 * window: quick ask's box shows and hides over other apps, so its focus says nothing about whether
 * Studio is in front. Returns the host's own port, or `undefined` without an agent host.
 *
 * @param location - the workspace's real path, which the host binds keys to
 */
export function provideAgentMessagingReaders(
  services: ServiceRegistry,
  transport: AgentHostTransport | undefined,
  location: string,
): AgentHostMessaging | undefined {
  if (transport === undefined) return undefined;
  const messaging = new AgentHostMessaging(transport, location);
  const active = new HostActiveAccount(
    services.has(HostSettingsService)
      ? services.get(HostSettingsService)
      : new MemoryHostSettingsStore(),
  );
  services.provide(ActiveAccountService, active);
  // One account at a time, for every reader of the port: the Inbox and Messenger in every window,
  // search and the overview, and so the desktop notifications, which follow the active account.
  // They all share one long poll of the host's changes (`services.shared-changes`).
  const shared = new SharedChanges(() => messaging.changes());
  const scoped = scopeToAccount(messaging, active, () => shared.listen());
  services.provide(AgentMessagingService, scoped);
  services.provide(SearchMessagingService, scoped);
  services.provide(OverviewMessagingService, scoped);
  services.provide(AgentActivityService, new AgentHostActivity(transport, location));
  services.provide(SyncDiagnosticsService, new AgentHostSyncDiagnostics(transport));
  services.provide(MessageReactionsService, new AgentHostReactions(transport, location));
  // The agents' action requests open in the Inbox, checked against the shipped catalog.
  provideActionSteppers(services);
  return messaging;
}
