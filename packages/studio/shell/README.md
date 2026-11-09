# @halonicjs/studio-shell

The Studio's feature registry and the contribution points features plug into. Headless: no React
here yet, only the typed registry and its rules, so features can be built against it.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-shell`

A feature declares itself once with `defineFeature`: its id, title, the services it `needs` and
the services it `provides`. `createShell` checks that the features fit together, then calls each
feature's `register` once, after the features whose services it needs. Any problem throws a
`ShellError` that names the features involved, and nothing is half-registered.

Services belong to one open workspace, so a feature gives a _factory_ for each service. Each time
a workspace opens, `shell.services.instantiate(registry)` builds them into that workspace's
registry (such as `ServiceRegistry` from `@halonicjs/app`), in dependency order. A factory can only
look up services its feature lists in `needs`.

| Part                            | What it does                                               | Requirement              |
| ------------------------------- | ---------------------------------------------------------- | ------------------------ |
| `defineFeature`, `createShell`  | register features in dependency order; refuse bad graphs   | `shell.feature-registry` |
| `serviceKey`, `studio.services` | provide services per workspace; lookups limited to `needs` | `shell.feature-services` |
| `shell.announcer`               | read text to screen readers, once per window               | `shell.announcer`        |

Contributions are app-wide and added once, in `register`. Their callbacks (an explorer group's
`items`, an item action's `run`) get a `WorkspaceContext` for the open workspace; the layout builds
it with `shell.services.contextFor(featureId, registry)`. The layout reads everything back from
`shell.contributions`, for example `shell.contributions.itemPage.sectionsFor("agent")`.

## Announcements

`shell.announcer` reads short texts to screen readers. There is one per window, shared by every
workspace in it, and every `WorkspaceContext` carries it as `context.announcer`. The frame mounts
a polite and an assertive `aria-live` region once at start-up with `announcer.mountRegions`; each
region's `say` clears it and sets the text on the next frame, so a repeat is read again. A Dialog
or sheet pushes its own regions with `announcer.pushModalRegions` while it is open, because screen
readers ignore everything outside an `aria-modal` dialog.

- `announce(text, politeness)` reads a text once. The same text within 2 s is read once, and
  assertively if either request was assertive.
- `announceState(key, text)` is for states that flip quickly, such as `run:43` going Running →
  Needs you → Running. It reads only the last text, 2 s after the last change for that key.
- `{ whenWindowFocused: true }` holds an announcement until the Studio window has focus again,
  for example after a sign-in that finished in the browser. The frame reports focus with
  `announcer.setWindowFocused`.

## Example

Two features: _routines_ puts a Triggers section on the _agents_ feature's item page, and uses
_agents_ only through its service key. The code lives in
[`examples/agents-and-routines.ts`](examples/agents-and-routines.ts), where it is typechecked and
run by `src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`,
because a package may not import itself by name; outside this package, import
`@halonicjs/studio-shell` as below.

```ts
import {
  createShell,
  defineFeature,
  loadView,
  type ServiceKey,
  type ServiceTarget,
  serviceKey,
} from "@halonicjs/studio-shell";

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
```
