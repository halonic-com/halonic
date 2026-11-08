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

Contributions are app-wide and added once, in `register`. Their callbacks (an explorer group's
`items`, an item action's `run`) get a `WorkspaceContext` for the open workspace; the layout builds
it with `shell.services.contextFor(featureId, registry)`. The layout reads everything back from
`shell.contributions`, for example `shell.contributions.itemPage.sectionsFor("agent")`.

## Example

```ts
import { createShell, defineFeature, serviceKey } from "@halonicjs/studio-shell";

const WorkspaceService = serviceKey<{ root: string }>("workspace");
const AgentsService = serviceKey<{ names(): string[] }>("agents");

const agentsFeature = defineFeature({
  id: "agents",
  title: "Agents",
  needs: [WorkspaceService],
  provides: [AgentsService],
  register(studio) {
    studio.services.provide(AgentsService, (services) => {
      const { root } = services.get(WorkspaceService);
      return { names: () => [`${root}/reviewer`] };
    });
  },
});

const shell = createShell({ features: [agentsFeature], hostServices: [WorkspaceService] });

// Each time a workspace opens:
const services = new Map<string, unknown>();
const registry = {
  provide: <S>(key: { name: string }, service: S) => services.set(key.name, service),
  get: <S>(key: { name: string }) => services.get(key.name) as S,
  has: (key: { name: string }) => services.has(key.name),
};
registry.provide(WorkspaceService, { root: "acme" });
shell.services.instantiate(registry);
registry.get(AgentsService).names(); // ["acme/reviewer"]
```
