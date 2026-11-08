import { defineFeature } from "../../feature.ts";
import { AgentsService } from "./api.ts";

/** A stub of the agents feature: the agent item kind, its explorer group and its service. */
export const agentsFeature = defineFeature({
  id: "agents",
  title: "Agents",
  provides: [AgentsService],
  register(studio) {
    studio.services.provide(AgentsService, () => ({ names: () => ["reviewer", "writer"] }));
    studio.itemKinds.add({
      kind: "agent",
      label: "Agent",
      icon: "agent",
      open: { view: "AgentEditorView", load: () => import("./ui/agent-editor-view.ts") },
    });
    studio.explorer.addGroup({ id: "agents", order: 20, title: "Agents", items: () => [] });
    studio.commands.add({ id: "agents.new", title: "New agent", run: () => {} });
    studio.keybindings.add({ command: "agents.new", keys: "Ctrl+Alt+A", when: "workspaceFocused" });
  },
});
