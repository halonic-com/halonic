# @halonicjs/app

The headless app kernel: command bus, event bus, service registry, workspace-wide undo and the routine scheduler service. No React.

- **Layer:** core
- **Owner:** liam
- **Public API:** `@halonicjs/app`

Everything belongs to **one open workspace** (`WorkspaceScope`) and is
disposed with it, because one window can hold several workspaces.
Device-wide settings such as the theme live outside any scope.

| Part                        | What it does                                                                                                                 | Requirement                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `CommandBus`                | typed commands, exactly one handler each                                                                                     | `app.command-bus`               |
| `EventBus`                  | typed events, listeners in order, one failing listener stops nothing                                                         | `app.event-bus`                 |
| `ServiceRegistry`           | services by typed key, disposed newest first                                                                                 | `app.service-registry`          |
| `WorkspaceScope`            | the three above for one workspace, closed together                                                                           | `app.workspace-scope`           |
| `WorkspaceFiles`            | unsaved changes by path, `save()` through the `DefinitionStore`                                                              | `app.workspace-save`            |
| `UndoHistory`               | one workspace-wide undo, 200 steps, typing in one file is one step                                                           | `app.workspace-undo`            |
| `openWorkspace`             | a scope with the files service and `workspace.save`, `undo`, `redo`                                                          | `app.workspace-save`            |
| `RoutineScheduler`          | starts due routine runs on each `Scheduler` tick, idempotently, with catch-up                                                | `app.routine-scheduler`         |
| `RoutineOverlap`            | what a routine does with a due time while its run is going: skip, queue or allow                                             | `app.routine-overlap`           |
| `workspaceRoutineScheduler` | a `RoutineScheduler` on the real routines tick, filling `{{trigger.at}}` and `{{trigger.lastRun}}`                           | `app.workspace-routines`        |
| `readToolListing`           | the tools a server lists, checked, rebuilt and named `<source>__<name>`, with their texts marked untrusted, and the refusals | `ports.untrusted-tool-listings` |
| `toolForModel`              | the tool definition the model gets, with every text a server wrote inside the untrusted fence                                | `ports.untrusted-tool-listings` |
| `listedToolsNotice`         | the fixed system prompt line saying an outside server wrote the fenced tool texts, when a listed tool is offered             | `ports.untrusted-tool-listings` |
| `checkToolCall`             | refuses arguments the offered parameters don't name, and asks before a tool above `read` runs                                | `ports.untrusted-tool-listings` |
| `refusalStatusLine`         | one line of plain text for a refusal in the integration status, never for the model                                          | `ports.untrusted-tool-listings` |
| `fenceUntrusted`            | puts outside text inside the untrusted fence, which holds when the text holds its markers                                    | `ports.untrusted-tool-listings` |
| `checkPinVersion`           | refuses a `ConnectorPin` whose version isn't one exact version, such as a tag (`latest`) or a range (`^2.3.1`)               | `app.connector-pin-version`     |
| `checkResolvedVersion`      | refuses a resolved package or version other than the pin's                                                                   | `app.connector-pin-version`     |
| `readPackageSpec`           | reads `name@1.2.3` (npm) or `name==1.2.3` (PyPI), and refuses no version, a tag, a range, a URL or a git source              | `app.connector-pin-spec`        |
| `isPackageRunner`           | whether a stdio command starts `npx`, `uvx` or another package runner, with any folder, case and ending, or through a shell  | `app.package-runner-launch`     |
| `checkPackageRunnerLaunch`  | refuses a package runner without an exact pin, and a pinned launch whose args or `env` could start another version           | `app.package-runner-launch`     |

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
