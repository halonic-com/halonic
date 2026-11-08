import { defineFeature } from "../../feature.ts";
import { AgentsService } from "../agents/api.ts";

/**
 * A stub of the routines feature. It puts a Triggers section on the agent
 * page through `itemPage.addSection`, and uses the agents feature only
 * through its `api.ts`.
 */
export const routinesFeature = defineFeature({
  id: "routines",
  title: "Routines",
  needs: [AgentsService],
  register(studio) {
    studio.itemPage.addSection({
      on: "agent",
      id: "triggers",
      order: 30,
      view: "AgentTriggersSection",
      load: () => import("./ui/agent-triggers-section.ts"),
    });
  },
});
