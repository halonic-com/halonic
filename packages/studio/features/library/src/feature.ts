import { defineFeature } from "@halonicjs/studio-shell";
import { ConnectorStatusHostService } from "./connector-status-host.ts";

/**
 * The Library feature. It adds the `connector` item kind, one tab per connector, whose page shows
 * the connector's state and what the engine refused from it. The full connector page (HAL-751)
 * takes the page over and keeps the status section.
 */
export const libraryFeature = defineFeature({
  id: "library",
  title: "Library",
  needs: [ConnectorStatusHostService],
  register(studio) {
    studio.itemKinds.add({
      kind: "connector",
      label: "Connector",
      icon: "library",
      open: { view: "ConnectorPage", load: () => import("./ui/connector-page.tsx") },
      tab: {
        describe: (item) => ({ label: item.id }),
        exists: () => true,
      },
    });
  },
});
