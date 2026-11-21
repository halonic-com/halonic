import { sandboxStartCheckKey } from "@halonicjs/app";
import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import { RunsListService, RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import { defineFeature } from "@halonicjs/studio-shell";
import { WorkflowGuideService, WorkflowsHostService } from "./api.ts";
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
  needs: [WorkflowsHostService, RunsSourceService, RunsListService],
  // The docked run card notes its run in the Inbox, which then leaves it out of its news.
  // Run is unavailable while the sandbox can't start, for a workflow whose steps need it.
  // A guide, such as the first run's, shows its card on a workflow's page.
  wants: [InboxService, sandboxStartCheckKey, WorkflowGuideService],
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
        // The tab opens with the id when the host hasn't read the workflow yet; the window names
        // it again once the host says it has (L14, HAL-12730).
        subscribe: (listener, context) =>
          context.services.get(WorkflowsHostService).subscribe(listener),
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
          .map((each) => {
            const hubName = host.hubs().find((hub) => hub.id === each.hubId)?.name ?? each.hubId;
            return {
              item: { kind: "workflow", hub: each.hubId, id: each.id },
              label: each.name,
              detail: searchWords.detail(hubName),
              hubName,
              ...(each.description === undefined ? {} : { description: each.description }),
            };
          });
      },
    });
    studio.commands.add({
      id: "workflows.new",
      title: searchWords.newCommand,
      // A phone doesn't edit workflows (UX 10.15), so its Search sheet doesn't offer it.
      phone: false,
      run: (context) => {
        if (context.openPlace === undefined) return;
        requestNewWorkflow();
        context.openPlace("workflows");
      },
    });
  },
});
