import { defineFeature } from "@halonicjs/studio-shell";
import { ConnectorStatusHostService } from "./connector-status-host.ts";
import { LibraryItemsHostService } from "./library-items-host.ts";
import { LibraryTabMemoryService } from "./library-tab-memory.ts";
import { requestLibraryTab } from "./library-tab-request.ts";
import { libraryKinds, tabLabel } from "./library-words.ts";
import { ListedToolsHostService } from "./listed-tools-host.ts";

/** Alt+4 to Alt+7 open the tabs, in the tabs' order. */
const firstTabKey = 4;

/**
 * The Library feature: the Library place with its four tabs (Alt+4 to Alt+7), and the `connector`
 * item kind, one tab per connector, whose page shows
 * the connector's state and what the engine refused from it. The full connector page (HAL-751)
 * takes the page over and keeps the status section.
 */
export const libraryFeature = defineFeature({
  id: "library",
  title: "Library",
  needs: [ConnectorStatusHostService, LibraryItemsHostService, LibraryTabMemoryService],
  // Without an agent host nothing can start a connector, so the review is not provided (HAL-8868).
  wants: [ListedToolsHostService],
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
