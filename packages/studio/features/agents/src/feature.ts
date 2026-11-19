import { sandboxStartCheckKey } from "@halonicjs/app";
import { defineFeature } from "@halonicjs/studio-shell";
import { AgentsHostService } from "./api.ts";
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
  // Try it waits while the sandbox can't start, for an agent whose harness is a program.
  wants: [sandboxStartCheckKey],
  register(studio) {
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
          .map((each) => ({
            item: { kind: "agent", hub: each.hubId, id: each.id },
            label: each.name,
            detail: searchWords.detail(
              host.hubs().find((hub) => hub.id === each.hubId)?.name ?? each.hubId,
            ),
            ...(each.description === undefined ? {} : { description: each.description }),
          }));
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
