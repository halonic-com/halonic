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

| Part                            | What it does                                               | Requirement               |
| ------------------------------- | ---------------------------------------------------------- | ------------------------- |
| `defineFeature`, `createShell`  | register features in dependency order; refuse bad graphs   | `shell.feature-registry`  |
| `serviceKey`, `studio.services` | provide services per workspace; lookups limited to `needs` | `shell.feature-services`  |
| `shell.announcer`               | read text to screen readers, once per window               | `shell.announcer`         |
| `shell.closeStack`              | close the right layer on Esc and Android's Back            | `shell.close-stack`       |
| `shell.engine`                  | send and announce when the engine is lost and back         | `shell.engine-connection` |
| `shell.engine.supervise`        | start the engine, restart it once, report why it failed    | `shell.engine-start`      |
| `saveFailureFor`                | turn a write error into a save reason                      | `shell.save-reasons`      |
| `watchResources`                | read the engine's resource numbers, flag a low disk        | `shell.resource-numbers`  |

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

## Esc and Back

`shell.closeStack` is the window's one close stack. A menu, dialog, card or panel registers with
`closeStack.open({ kind, close })` when it opens and calls the returned function when it closes.
The frame passes Esc to `closeStack.escape(event)` and Android's Back to `closeStack.back()`; both
close the first layer by rank (inline edit, menu, tooltip, dialog or sheet, summary drawer,
stacked card, docked card, maximise, side panel), and within a rank the one opened last. Both
return `false` when nothing was open, so the key goes on. A layer can refuse by returning `false`
from `close`, and the side panel passes `isActive` so it only counts while focus is inside it.

Features can't bind a bare `Escape` with `keybindings.add`: register a layer instead.

## Engine connection

At start-up the app hands its `RunExecutor` to `shell.engine.watch(executor)`. A remote executor
(served mode, or a phone connected to a host) has a `connection` that can be `lost`; the local one
has none and counts as always connected. Each change is sent once as `engine.connection { state }`
to listeners added with `shell.engine.on("engine.connection", listener)`, and announced once: the
loss assertively, the return politely. `shell.engine.connection` is the state now, and
`shell.engine.status` the last event with its details.

On the desktop the app starts the engine process instead: it hands an `EngineLauncher` to
`shell.engine.supervise(launcher)`. The shell sends `starting { attempt, since }` at once, then
`connected` when the engine answers. A start that fails sends `failed { failure }` with one of
three reasons, and the shell doesn't try again by itself:

| Reason                     | When                                          |
| -------------------------- | --------------------------------------------- |
| `stopped-while-starting`   | the process ended first; `exitCode` is kept   |
| `no-answer`                | no answer within 30 s; the process is stopped |
| `data-folder-not-writable` | the engine reported it can't write its data   |

The engine's last log lines go to the log, not into the event. A running engine that stops sends
`lost` and is started again once, 2 s later, as attempt 2 with `lastExitCode`. If it stops again
within 60 s of that restart, the shell sends `failed` instead of looping. `retry()` (a Try again
button) starts from attempt 1; `stop()` stops the engine and its timers. Only the loss and the
return are announced; the start and failure texts wait for the approved wording (HAL-1720).

## Save reasons

A screen that saves a file passes the error to `saveFailureFor`, the one place that reads write
error codes, and words its message from the reason: `disk-full` (`ENOSPC`, `EDQUOT`),
`not-writable` (`EACCES`, `EPERM`, `EROFS`), `in-use` (`EBUSY`, which includes the Windows sharing
violation) or `failed` for anything else. The code and the original message stay in the result for
Copy details; they never go on screen (rule 4 of the failure-path guide).

## Error messages

A screen with no text of its own for a failure passes the error and its "Couldn't…" title to
`errorMessageFor`, the one place the Studio turns an error kind into words (microcopy 22 F13).
The kind picks the body and the one action, which the screen wires up. A kinded error's message is
the body unless the screen says more, such as the missing item's kind or the service that didn't
answer. An `internal` error never shows its message: the body is "Halonic ran into a problem it
can't explain yet." with **Copy details**. A `conflict` offers **Load the latest** only when the
item has no unsaved edits; a file's own **Keep mine / Load theirs** wins over this message.

## Resource numbers

`watchResources({ read, timers, onError })` reads the engine's resource report: its memory, the
memory of each process it started, the disk space Halonic's data uses, the free space on the data
drive, and the local models Ollama has loaded (`loadedModels` is left out when Ollama didn't
answer, which is not the same as none loaded). `readResourceReport` checks what crossed the bridge
and throws a `ShellError` rather than pass on a number it can't trust.

It reads at once, then once a minute, timed from the end of the last read. A run, a download or a
model pull calls `check("run" | "download" | "model-pull")` before it starts; a check joins a read
that is already under way. Each reading has `lowDisk`, true below 1 GB free (`lowDiskBytes`).
Where Studio shows these numbers waits on the board (HAL-1720), so this is the data only.

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
