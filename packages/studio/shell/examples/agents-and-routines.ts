import {
  createShell,
  defineFeature,
  loadView,
  type ServiceKey,
  type ServiceTarget,
  serviceKey,
} from "../src/index.ts";

// In a real feature this key lives in the agents feature's api.ts.
const AgentsService = serviceKey<{ names(): readonly string[] }>("agents");

const agentsFeature = defineFeature({
  id: "agents",
  title: "Agents",
  provides: [AgentsService],
  register(studio) {
    studio.services.provide(AgentsService, () => ({ names: () => ["reviewer", "writer"] }));
    studio.itemKinds.add({
      kind: "agent",
      label: "Agent",
      icon: "agent",
      open: {
        view: "AgentEditorView",
        load: async () => ({ AgentEditorView: () => "agent page" }),
      },
    });
    studio.commands.add({ id: "agents.new", title: "New agent", run: () => {} });
    studio.keybindings.add({ command: "agents.new", keys: "Ctrl+Alt+A", when: "workspaceFocused" });
  },
});

const routinesFeature = defineFeature({
  id: "routines",
  title: "Routines",
  needs: [AgentsService],
  register(studio) {
    studio.itemPage.addSection({
      on: "agent",
      id: "triggers",
      order: 30,
      view: "AgentTriggersSection",
      load: async () => ({ AgentTriggersSection: () => "triggers" }),
    });
  },
});

/** A minimal workspace registry; the Studio uses `ServiceRegistry` from `@halonicjs/app`. */
class WorkspaceServices implements ServiceTarget {
  private readonly services = new Map<string, unknown>();
  provide<Service>(key: ServiceKey<Service>, service: Service): void {
    this.services.set(key.name, service);
  }
  get<Service>(key: ServiceKey<Service>): Service {
    return this.services.get(key.name) as Service;
  }
  has(key: ServiceKey<unknown>): boolean {
    return this.services.has(key.name);
  }
}

/** Registers both features, opens a workspace and reads back what they contributed. */
export async function runExample(): Promise<{
  sections: string[];
  shortcut: string | undefined;
  agents: readonly string[];
  section: string;
}> {
  const shell = createShell({ features: [routinesFeature, agentsFeature] });

  const workspace = new WorkspaceServices();
  shell.services.instantiate(workspace);

  const sections = shell.contributions.itemPage.sectionsFor("agent");
  const [triggers] = sections;
  const section = triggers === undefined ? "" : (await loadView<() => string>(triggers))();
  const pressed = shell.contributions.keybindings.resolve(
    "ctrl+alt+a",
    new Set(["workspaceFocused"]),
  );
  return {
    sections: sections.map((entry) => `${entry.featureId}:${entry.id}`), // ["routines:triggers"]
    shortcut: pressed?.command, // "agents.new"
    agents: workspace.get(AgentsService).names(), // ["reviewer", "writer"]
    section, // "triggers"
  };
}
