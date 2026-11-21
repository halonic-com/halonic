import { sandboxStartCheckKey } from "@halonicjs/app";
import { defineFeature } from "@halonicjs/studio-shell";
import { RoutinesHostService } from "./api.ts";
import { listWords, searchWords } from "./list/list-words.ts";
import { requestNewRoutine } from "./list/new-request.ts";
import { triggersWords } from "./triggers/triggers-words.ts";

/**
 * The Routines feature: the Routines list with its New routine dialog, and the `routine` item kind
 * with its page and Ctrl K search. The Triggers sections on agents and workflows are added to
 * their pages; the interface other features use is in `api.ts`.
 */
export const routinesFeature = defineFeature({
  id: "routines",
  title: "Routines",
  needs: [RoutinesHostService],
  // Run now is unavailable while the sandbox can't start, for a routine whose target needs it.
  wants: [sandboxStartCheckKey],
  register(studio) {
    studio.places.add({
      id: "routines",
      view: "RoutinesPage",
      load: () => import("./list/routines-page.tsx"),
    });
    studio.itemKinds.add({
      kind: "routine",
      label: "Routine",
      icon: "routines",
      place: "routines",
      open: { view: "RoutinePage", load: () => import("./page/routine-page.tsx") },
      tab: {
        describe: (item, context) => ({
          label:
            context.services.get(RoutinesHostService).nameOf({ hubId: item.hub, id: item.id }) ??
            item.id,
        }),
        exists: () => true,
      },
    });
    for (const on of ["agent", "workflow"]) {
      studio.itemPage.addSection({
        on,
        id: "triggers",
        title: triggersWords.heading,
        order: 30,
        view: "TriggersSection",
        load: () => import("./triggers/triggers-section.tsx"),
      });
    }
    studio.search.addProvider({
      id: "routines",
      title: searchWords.title,
      order: 25,
      search: async (query, context) => {
        const needle = query.trim().toLowerCase();
        if (needle === "") return [];
        const host = context.services.get(RoutinesHostService);
        const listings = await host.list();
        // Only a routine in a hub has a tab, as on the list.
        return listings.flatMap((each) => {
          const { hubId } = each;
          const matches = [each.name, each.id].some((text) => text.toLowerCase().includes(needle));
          if (hubId === null || !matches) return [];
          const hubName = host.hubs().find((hub) => hub.id === hubId)?.name ?? hubId;
          return [
            {
              item: { kind: "routine", hub: hubId, id: each.id },
              label: each.name,
              detail: searchWords.detail(hubName),
              hubName,
              description: each.summary,
            },
          ];
        });
      },
    });
    studio.commands.add({
      id: "routines.new",
      title: listWords.newRoutine,
      run: (context) => {
        if (context.openPlace === undefined) return;
        requestNewRoutine();
        context.openPlace("routines");
      },
    });
  },
});
