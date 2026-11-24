import type { AgentMessaging } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * How Studio's features reach agents, whoever runs them: the engine's
 * `AgentMessaging` (ADR 2026-11-24, agent messaging). Features reach the port
 * only through this key, never through a provider. Where no engine serves it
 * yet, nothing provides it, and the Inbox and Messenger show no agent items.
 * Tests provide a `FakeAgentMessaging`.
 */
export const AgentMessagingService: ServiceKey<AgentMessaging> =
  serviceKey<AgentMessaging>("agent-messaging");
