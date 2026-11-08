# @halonicjs/app

The headless app kernel: command bus, event bus, service registry, workspace-wide undo and the routine scheduler service. No React.

- **Layer:** core
- **Owner:** liam
- **Public API:** `@halonicjs/app`

Everything belongs to **one open workspace** (`WorkspaceScope`) and is
disposed with it, because one window can hold several workspaces.
Device-wide settings such as the theme live outside any scope.

| Part              | What it does                                                         | Requirement            |
| ----------------- | -------------------------------------------------------------------- | ---------------------- |
| `CommandBus`      | typed commands, exactly one handler each                             | `app.command-bus`      |
| `EventBus`        | typed events, listeners in order, one failing listener stops nothing | `app.event-bus`        |
| `ServiceRegistry` | services by typed key, disposed newest first                         | `app.service-registry` |
| `WorkspaceScope`  | the three above for one workspace, closed together                   | `app.workspace-scope`  |

## Example

```ts
import { type CommandSpec, WorkspaceScope } from "@halonicjs/app";

declare module "@halonicjs/app" {
  interface AppCommands {
    "agents.create": CommandSpec<{ name: string }, string>;
  }
}

const scope = new WorkspaceScope({
  location: "memory:demo",
  onListenerError: (error, eventName) => console.error(eventName, error),
});
scope.commands.register("agents.create", ({ name }) => name.toLowerCase());
await scope.commands.execute("agents.create", { name: "Reviewer" }); // "reviewer"
await scope.close();
```
