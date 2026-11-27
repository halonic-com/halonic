import type { AgentMessaging } from "@halonicjs/ports";
import {
  ActionCatalogService,
  type RequesterPolicy,
  RequesterPolicyService,
  type StepperCatalog,
} from "@halonicjs/studio-feature-action-steppers/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import {
  type ActionSteps,
  type AgentConnections,
  AgentConnectionsService,
  AgentMessagingService,
  actionStepsKey,
  serverSessionShellKey,
} from "@halonicjs/studio-services";
import type { PlaceViewProps } from "@halonicjs/studio-shell";
import type { ServerSessionHost } from "./use-action-checks.ts";

/** What the Inbox page reads for the agents' items, as `InboxView` takes it. */
export interface AgentServices {
  readonly agentMessaging: AgentMessaging | undefined;
  readonly actionCatalog: StepperCatalog | undefined;
  readonly requesterPolicy: RequesterPolicy | undefined;
  readonly actionSteps: ActionSteps | undefined;
  readonly agentConnections: AgentConnections | undefined;
  readonly serverSession: ServerSessionHost;
}

/**
 * The services the agents' items read from the window (`inbox.agent-inbox-items`): their cards,
 * what an action item is checked against and runs with, and what "Run with Claude" starts with.
 * Each one the app doesn't provide is `undefined`.
 */
export function agentServicesOf(context: PlaceViewProps["context"]): AgentServices {
  const { services } = context;
  return {
    agentMessaging: services.find(AgentMessagingService),
    actionCatalog: services.find(ActionCatalogService),
    requesterPolicy: services.find(RequesterPolicyService),
    actionSteps: services.find(actionStepsKey),
    agentConnections: services.find(AgentConnectionsService),
    serverSession: {
      shell: services.find(serverSessionShellKey),
      settings: services.find(HostSettingsService),
      openSettings: context.openSettings,
    },
  };
}
