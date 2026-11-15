import { defineFeature } from "@halonicjs/studio-shell";
import { WorkflowsHostService } from "./api.ts";

/**
 * The Workflows feature: the Workflows list with its New workflow dialog, and the `workflow` item
 * kind. The canvas, step cards, Configuration, Tests and starting a run land in the next pull
 * requests; the interface other features use is in `api.ts`.
 */
export const workflowsFeature = defineFeature({
  id: "workflows",
  title: "Workflows",
  needs: [WorkflowsHostService],
  register(studio) {
    studio.places.add({
      id: "workflows",
      view: "WorkflowsPage",
      load: () => import("./list/workflows-page.tsx"),
    });
    studio.itemKinds.add({
      kind: "workflow",
      label: "Workflow",
      icon: "workflows",
      place: "workflows",
      open: { view: "WorkflowPage", load: () => import("./page/workflow-page.tsx") },
      tab: { describe: (item) => ({ label: item.id }), exists: () => true },
    });
  },
});
