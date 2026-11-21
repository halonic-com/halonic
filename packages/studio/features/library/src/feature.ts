import type { LibraryItemKind } from "@halonicjs/app";
import { defineFeature, type ItemRef, type WorkspaceContext } from "@halonicjs/studio-shell";
import { CollectionHostService } from "./collection-host.ts";
import { ConnectorSecretsService } from "./connector-secrets-host.ts";
import { ConnectorStatusHostService } from "./connector-status-host.ts";
import { KnowledgeHostService } from "./knowledge-host.ts";
import { LibraryItemsHostService } from "./library-items-host.ts";
import { LibraryTabMemoryService } from "./library-tab-memory.ts";
import { requestLibraryTab } from "./library-tab-request.ts";
import { libraryKinds, tabLabel } from "./library-words.ts";
import { ListedToolsHostService } from "./listed-tools-host.ts";
import { NewCollectionHostService } from "./new-collection-host.ts";
import { NewConnectorHostService } from "./new-connector-host.ts";
import { requestNewConnector } from "./new-connector-request.ts";
import { newConnectorWords } from "./new-connector-words.ts";
import { NewSkillHostService } from "./new-skill-host.ts";
import { sharedHubKey } from "./shared-hub-key.ts";
import { SkillHostService } from "./skill-host.ts";

/** The name the list shows for the item, or its id while the host hasn't read it (HAL-11790). */
function nameOfItem(context: WorkspaceContext, kind: LibraryItemKind, item: ItemRef): string {
  const place = { hub: item.hub === sharedHubKey ? null : item.hub, id: item.id };
  return context.services.find(LibraryItemsHostService)?.nameOf?.(kind, place) ?? item.id;
}

/**
 * Tells the window each time a Library item may have changed, so a renamed item's tabs and phone
 * pages take the new name (C403 PT1, HAL-14489).
 */
function subscribeToItems(listener: () => void, context: WorkspaceContext): () => void {
  return context.services.find(LibraryItemsHostService)?.subscribe(listener) ?? (() => undefined);
}

/** Alt+4 to Alt+7 open the tabs, in the tabs' order. */
const firstTabKey = 4;

/**
 * The Library feature: the Library place with its four tabs (Alt+4 to Alt+7), the `skill` item
 * kind (its page edits a skill's name, when to use it and instructions), the `knowledge` kind
 * (its page sets a source's summary and lookup mode), the `collection` kind (its page shows the
 * records in a grid, HAL-12534), and the `connector` item kind, one tab per connector, whose page shows
 * the connector's state and what the engine refused from it. The full connector page (HAL-751)
 * takes the page over and keeps the status section.
 */
export const libraryFeature = defineFeature({
  id: "library",
  title: "Library",
  needs: [ConnectorStatusHostService, LibraryItemsHostService, LibraryTabMemoryService],
  // Without an agent host nothing can start a connector, so the review is not provided (HAL-8868).
  // Without a skill host a skill's page says the skill isn't in the workspace (HAL-1303 P5c gives it one).
  // The place's New buttons and a collection's page look up their hosts too (HAL-11189).
  // Only the desktop app gives a connector's secrets a place to be set (HAL-14995).
  wants: [
    ListedToolsHostService,
    ConnectorSecretsService,
    SkillHostService,
    KnowledgeHostService,
    CollectionHostService,
    NewCollectionHostService,
    NewConnectorHostService,
    NewSkillHostService,
  ],
  register(studio) {
    studio.places.add({
      id: "library",
      view: "LibraryPlace",
      load: () => import("./ui/library-place.tsx"),
    });
    libraryKinds.forEach((kind, index) => {
      const command = `library.${kind}`;
      studio.commands.add({
        id: command,
        title: `Open ${tabLabel(kind)}`,
        run: (context) => {
          if (context.openPlace === undefined) return;
          requestLibraryTab(kind);
          context.openPlace("library");
        },
      });
      studio.keybindings.add({
        command,
        keys: `Alt+${firstTabKey + index}`,
        when: "workspaceFocused",
      });
    });
    // The Inbox's **Go to the secret field** runs this by id, as it can't import the Library.
    studio.commands.add({
      id: "library.new-connector",
      title: newConnectorWords.title,
      phone: false,
      run: (context) => {
        if (context.openPlace === undefined) return;
        requestNewConnector({});
        context.openPlace("library");
      },
    });
    studio.itemKinds.add({
      kind: "skill",
      label: "Skill",
      icon: "library",
      place: "library",
      open: { view: "SkillPage", load: () => import("./ui/skill-page.tsx") },
      tab: {
        describe: (item, context) => ({ label: nameOfItem(context, "skill", item) }),
        exists: () => true,
        subscribe: subscribeToItems,
      },
    });
    studio.itemKinds.add({
      kind: "knowledge",
      label: "Knowledge",
      icon: "library",
      place: "library",
      open: { view: "KnowledgePage", load: () => import("./ui/knowledge-page.tsx") },
      tab: {
        describe: (item, context) => ({ label: nameOfItem(context, "knowledge", item) }),
        exists: () => true,
        subscribe: subscribeToItems,
      },
    });
    studio.itemKinds.add({
      kind: "collection",
      label: "Collection",
      icon: "library",
      place: "library",
      open: { view: "CollectionPage", load: () => import("./ui/collection-page.tsx") },
      tab: {
        describe: (item, context) => ({ label: nameOfItem(context, "collection", item) }),
        exists: () => true,
        subscribe: subscribeToItems,
      },
    });
    studio.itemKinds.add({
      kind: "connector",
      label: "Connector",
      icon: "library",
      place: "library",
      open: { view: "ConnectorPage", load: () => import("./ui/connector-page.tsx") },
      tab: {
        describe: (item, context) => ({ label: nameOfItem(context, "connector", item) }),
        exists: () => true,
        subscribe: subscribeToItems,
      },
    });
  },
});
