import type { Disposable, ServiceRegistry } from "@halonicjs/app";
import { AgentNotifierService } from "@halonicjs/studio-feature-inbox/api";
import { AgentMessagingService, type Notifier } from "@halonicjs/studio-services";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** The folder's agent notifier, which the folder's registry disposes when it closes. */
export const agentNotifierDisposeKey: ServiceKey<Disposable> = serviceKey<Disposable>(
  "studio.agent-notifier-dispose",
);

/**
 * Gives the Inbox the folder's desktop notifications for the agents' items
 * (`inbox.agent-notifications-start`), such as the shell's `ShellNotifier`. Without the agents'
 * messaging there is nothing to notify of, so nothing is provided. Closing the folder disposes
 * the notifier, so a click on a notification of a closed folder opens nothing.
 */
export function provideAgentNotifier(
  services: ServiceRegistry,
  notifier: Notifier & Disposable,
): void {
  if (!services.has(AgentMessagingService)) return;
  services.provide(AgentNotifierService, notifier);
  services.provide(agentNotifierDisposeKey, { dispose: () => notifier.dispose() });
}
