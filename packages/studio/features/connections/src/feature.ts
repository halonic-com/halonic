import {
  ActiveAccountService,
  AgentConnectionsService,
  ServerEngineService,
  SyncDiagnosticsService,
} from "@halonicjs/studio-services";
import { defineFeature, type WorkspaceContext } from "@halonicjs/studio-shell";
import { SECTION_LINE, SECTION_TITLE } from "./connections-words.ts";
import * as diagnosticsWords from "./diagnostics/sync-diagnostics-words.ts";
import { paperclipSignIn } from "./sign-in-needed/paperclip-sign-in.ts";

/** Whether the engine serves connections; without them the section never shows. */
export function connectionsAvailable(
  context: WorkspaceContext,
  set: (available: boolean) => void,
): () => void {
  set(context.services.find(AgentConnectionsService) !== undefined);
  return () => undefined;
}

/** Whether the engine keeps sync counters; without them Settings › Sync diagnostics never shows. */
export function diagnosticsAvailable(
  context: WorkspaceContext,
  set: (available: boolean) => void,
): () => void {
  set(context.services.find(SyncDiagnosticsService) !== undefined);
  return () => undefined;
}

/**
 * Connections: Settings › Connections, where a person connects Paperclip, signs in again and
 * disconnects (`connections.connection-row`), and the Connect dialog it opens
 * (`connections.connect-dialog`). It reaches the engine only through `AgentConnectionsService`,
 * so it knows no provider's types; it shows only where the app provides that service. It also sets
 * the sidebar's footer item, the account switcher (`connections.account-switcher`): with more than
 * one account linked, the Inbox and Messenger show the one picked there. Where the host serves
 * `ServerEngineService`, the section starts with the Messaging engine row and its Pair with a
 * server dialog (`connections.engine-row`, `connections.server-pair-dialog`). Next to the section,
 * Settings › Sync diagnostics shows how the engine kept them up to date
 * (`connections.sync-diagnostics`). It adds the Paperclip sign-in every app shows while a
 * connection is signed out (`connections.paperclip-sign-in-needed`).
 */
export const connectionsFeature = defineFeature({
  id: "connections",
  title: "Connections",
  wants: [
    AgentConnectionsService,
    ActiveAccountService,
    ServerEngineService,
    SyncDiagnosticsService,
  ],
  register(studio) {
    studio.signIns.add(paperclipSignIn);
    studio.sidebarFooter.add({
      id: "connections.account-switcher",
      order: 100,
      view: "AccountSwitcherItem",
      load: () => import("./account-switcher/account-switcher-item.tsx"),
    });
    studio.settings.add({
      id: "connections",
      icon: "connections",
      title: SECTION_TITLE,
      scope: "workspace",
      group: "connections",
      // First in Account and connections, before Remote (35).
      order: 30,
      description: SECTION_LINE,
      available: connectionsAvailable,
      view: "ConnectionsSection",
      load: () => import("./settings/connections-section.tsx"),
    });
    studio.settings.add({
      id: "sync-diagnostics",
      icon: "connections",
      title: diagnosticsWords.SECTION_TITLE,
      scope: "host",
      group: "connections",
      // Right after Connections (30), before Remote (35).
      order: 31,
      description: diagnosticsWords.SECTION_LINE,
      available: diagnosticsAvailable,
      view: "SyncDiagnosticsSection",
      load: () => import("./diagnostics/sync-diagnostics-section.tsx"),
    });
  },
});
