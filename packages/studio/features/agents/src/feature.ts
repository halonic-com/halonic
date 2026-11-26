import { sandboxStartCheckKey } from "@halonicjs/app";
import { ShowInChatService } from "@halonicjs/studio-feature-assistant/api";
import { FilesHostService } from "@halonicjs/studio-feature-files/api";
import { ModelsService } from "@halonicjs/studio-feature-models/api";
import { RoutineRunAgentsService } from "@halonicjs/studio-feature-routines/api";
import { defineFeature, FilesWithErrorsService } from "@halonicjs/studio-shell";
import { AgentReviewService, AgentsHostService } from "./api.ts";
import { searchWords } from "./list/list-words.ts";
import { requestNewAgent } from "./list/new-request.ts";

/**
 * The Agents feature: the Agents list with its New agent dialog, and the `agent` item kind. The
 * agent page, Configuration and Try it chat land in the next pull requests; the interface other
 * features use is in `api.ts`.
 */
export const agentsFeature = defineFeature({
  id: "agents",
  title: "Agents",
  needs: [AgentsHostService],
  // Try it waits while the sandbox can't start, for an agent whose harness is a program. An agent
  // file that didn't load keeps its row, which opens and deletes the file itself (C348).
  wants: [
    sandboxStartCheckKey,
    FilesWithErrorsService,
    FilesHostService,
    // The assistant's changes to review; where the app has none, the page shows no bar.
    AgentReviewService,
    // Show in chat in a row's and the page's ⋮ (assistant.chat.show-in-chat).
    ShowInChatService,
    // Try it's Set the key › and the Model page's alias line open Models (models flow 3.3, UX 2.5).
    ModelsService,
  ],
  // The confirm-again Callout of an agent on hold, on the page of a routine that runs it.
  provides: [RoutineRunAgentsService],
  register(studio) {
    studio.services.provide(RoutineRunAgentsService, (services) => {
      const host = services.get(AgentsHostService);
      return {
        view: "RoutineConfirmAgain",
        load: async () => {
          const { routineConfirmAgainOf } = await import(
            "./confirm-again/routine-confirm-again.tsx"
          );
          return { RoutineConfirmAgain: routineConfirmAgainOf(host) };
        },
      };
    });
    studio.places.add({
      id: "agents",
      view: "AgentsPage",
      load: () => import("./list/agents-page.tsx"),
    });
    studio.itemKinds.add({
      kind: "agent",
      label: "Agent",
      icon: "agents",
      place: "agents",
      open: { view: "AgentPage", load: () => import("./page/agent-page.tsx") },
      tab: {
        describe: (item, context) => ({
          label:
            context.services.get(AgentsHostService).nameOf({ hubId: item.hub, id: item.id }) ??
            item.id,
        }),
        exists: () => true,
        // The window names the tab again when the host says the agents changed, so a rename shows
        // on the tab as it does on the page (AG2, HAL-14377).
        subscribe: (listener, context) =>
          context.services.get(AgentsHostService).subscribe(listener),
      },
    });
    studio.search.addProvider({
      id: "agents",
      title: searchWords.title,
      order: 10,
      search: async (query, context) => {
        const needle = query.trim().toLowerCase();
        if (needle === "") return [];
        const host = context.services.get(AgentsHostService);
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
              item: { kind: "agent", hub: each.hubId, id: each.id },
              label: each.name,
              detail: searchWords.detail(hubName),
              hubName,
              ...(each.description === undefined ? {} : { description: each.description }),
            };
          });
      },
    });
    studio.commands.add({
      id: "agents.new",
      title: searchWords.newCommand,
      run: (context) => {
        if (context.openPlace === undefined) return;
        requestNewAgent();
        context.openPlace("agents");
      },
    });
  },
});
