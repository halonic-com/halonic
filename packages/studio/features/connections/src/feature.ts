import { ActiveAccountService, AgentConnectionsService } from "@halonicjs/studio-services";
import { defineFeature, type WorkspaceContext } from "@halonicjs/studio-shell";
import { SECTION_LINE, SECTION_TITLE } from "./connections-words.ts";

/** Whether the engine serves connections; without them the section never shows. */
export function connectionsAvailable(
  context: WorkspaceContext,
  set: (available: boolean) => void,
): () => void {
  set(context.services.find(AgentConnectionsService) !== undefined);
  return () => undefined;
}

/**
 * Connections: Settings › Connections, where a person connects Paperclip, signs in again and
 * disconnects (`connections.connection-row`), and the Connect dialog it opens
 * (`connections.connect-dialog`). It reaches the engine only through `AgentConnectionsService`,
 * so it knows no provider's types; it shows only where the app provides that service. It also sets
 * the sidebar's footer item, the account switcher (`connections.account-switcher`): with more than
 * one account linked, the Inbox and Messenger show the one picked there.
 */
export const connectionsFeature = defineFeature({
  id: "connections",
  title: "Connections",
  wants: [AgentConnectionsService, ActiveAccountService],
  register(studio) {
    studio.sidebarFooter.add({
      id: "connections.account-switcher",
      order: 100,
      view: "AccountSwitcherItem",
      load: () => import("./account-switcher/account-switcher-item.tsx"),
    });
    studio.settings.add({
      id: "connections",
      title: SECTION_TITLE,
      scope: "workspace",
      order: 40,
      description: SECTION_LINE,
      available: connectionsAvailable,
      view: "ConnectionsSection",
      load: () => import("./settings/connections-section.tsx"),
    });
  },
});
