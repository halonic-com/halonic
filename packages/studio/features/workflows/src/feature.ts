import { defineFeature } from "@halonicjs/studio-shell";
import { WorkflowsHostService } from "./api.ts";
import { searchWords } from "./list/list-words.ts";
import { requestNewWorkflow } from "./list/new-request.ts";

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
      tab: {
        describe: (item, context) => ({
          label:
            context.services.get(WorkflowsHostService).nameOf({ hubId: item.hub, id: item.id }) ??
            item.id,
        }),
        exists: () => true,
      },
    });
    studio.search.addProvider({
      id: "workflows",
      title: searchWords.title,
      order: 20,
      search: async (query, context) => {
        const needle = query.trim().toLowerCase();
        if (needle === "") return [];
        const host = context.services.get(WorkflowsHostService);
        const listings = await host.list();
        return listings
          .filter((each) =>
            [each.name, each.id, each.description ?? ""].some((text) =>
              text.toLowerCase().includes(needle),
            ),
          )
          .map((each) => ({
            item: { kind: "workflow", hub: each.hubId, id: each.id },
            label: each.name,
            detail: searchWords.detail(
              host.hubs().find((hub) => hub.id === each.hubId)?.name ?? each.hubId,
            ),
            ...(each.description === undefined ? {} : { description: each.description }),
          }));
      },
    });
    studio.commands.add({
      id: "workflows.new",
      title: searchWords.newCommand,
      run: (context) => {
        if (context.openPlace === undefined) return;
        requestNewWorkflow();
        context.openPlace("workflows");
      },
    });
  },
});
