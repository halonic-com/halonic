import { defineFeature } from "@halonicjs/studio-shell";
import { CollectionHostService } from "./collection-host.ts";
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
import { NewSkillHostService } from "./new-skill-host.ts";
import { SkillHostService } from "./skill-host.ts";

/** Alt+4 to Alt+7 open the tabs, in the tabs' order. */
const firstTabKey = 4;

/**
 * The Library feature: the Library place with its four tabs (Alt+4 to Alt+7), the `skill` item
 * kind (its page edits a skill's name, when to use it and instructions), the `knowledge` kind
 * (its page sets a source's summary and lookup mode), and the `connector`
 * item kind, one tab per connector, whose page shows
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
  wants: [
    ListedToolsHostService,
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
      title: "New connector",
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
        describe: (item) => ({ label: item.id }),
        exists: () => true,
      },
    });
    studio.itemKinds.add({
      kind: "knowledge",
      label: "Knowledge",
      icon: "library",
      place: "library",
      open: { view: "KnowledgePage", load: () => import("./ui/knowledge-page.tsx") },
      tab: {
        describe: (item) => ({ label: item.id }),
        exists: () => true,
      },
    });
    studio.itemKinds.add({
      kind: "connector",
      label: "Connector",
      icon: "library",
      place: "library",
      open: { view: "ConnectorPage", load: () => import("./ui/connector-page.tsx") },
      tab: {
        describe: (item) => ({ label: item.id }),
        exists: () => true,
      },
    });
  },
});
