# @halonicjs/app

The headless app kernel: command bus, event bus, service registry, workspace-wide undo and the routine scheduler service. No React.

- **Layer:** core
- **Owner:** liam
- **Public API:** `@halonicjs/app`

Everything belongs to **one open workspace** (`WorkspaceScope`) and is
disposed with it, because one window can hold several workspaces.
Device-wide settings such as the theme live outside any scope.

| Part                        | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Requirement                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `CommandBus`                | typed commands, exactly one handler each                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `app.command-bus`                 |
| `EventBus`                  | typed events, listeners in order, one failing listener stops nothing                                                                                                                                                                                                                                                                                                                                                                                                                            | `app.event-bus`                   |
| `ServiceRegistry`           | services by typed key, disposed newest first                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `app.service-registry`            |
| `WorkspaceScope`            | the three above for one workspace, closed together                                                                                                                                                                                                                                                                                                                                                                                                                                              | `app.workspace-scope`             |
| `WorkspaceFiles`            | unsaved changes by path, `save()` through the `DefinitionStore`                                                                                                                                                                                                                                                                                                                                                                                                                                 | `app.workspace-save`              |
| `UndoHistory`               | one workspace-wide undo, 200 steps, typing in one file is one step                                                                                                                                                                                                                                                                                                                                                                                                                              | `app.workspace-undo`              |
| `openWorkspace`             | a scope with the files service and `workspace.save`, `undo`, `redo`                                                                                                                                                                                                                                                                                                                                                                                                                             | `app.workspace-save`              |
| `RoutineScheduler`          | starts due routine runs on each `Scheduler` tick, idempotently, with catch-up                                                                                                                                                                                                                                                                                                                                                                                                                   | `app.routine-scheduler`           |
| `RoutineOverlap`            | what a routine does with a due time while its run is going: skip, queue or allow                                                                                                                                                                                                                                                                                                                                                                                                                | `app.routine-overlap`             |
| `QueuedTimes`               | a routine's queued due times (count, first, last), read with `RoutineScheduler.queuedTimes()` without a tick                                                                                                                                                                                                                                                                                                                                                                                    | `app.scheduler-reads-queue`       |
| `SkipRecord`                | a routine's skipped due times with the reason, read with `RoutineScheduler.skippedTimes(key)`; late runs get `trigger.catchUp`; a target that can't start is `target-unavailable` with `why` (`app.scheduler-skip-target-unavailable`)                                                                                                                                                                                                                                                          | `app.scheduler-keeps-skips`       |
| `workspaceRoutineScheduler` | a `RoutineScheduler` on the real routines tick, filling `{{trigger.at}}` and `{{trigger.lastRun}}`                                                                                                                                                                                                                                                                                                                                                                                              | `app.workspace-routines`          |
| `placedRoutines`            | every routine file of a loaded workspace with its hub, for the routine scheduler's `routines`                                                                                                                                                                                                                                                                                                                                                                                                   | `app.placed-routines`             |
| `liveVersionOf`             | a workspace's live version: `history-off` without version control, `none-yet` without a commit, else the latest commit on the current branch                                                                                                                                                                                                                                                                                                                                                    | `app.live-version`                |
| `liveState`                 | whether an item's saved file is the live one: `never-versioned`, `live`, or `not-live` with the date of the live version; `live` for every item with history off. It ignores the fields in `actsAtOnce` (a routine's `enabled`)                                                                                                                                                                                                                                                                 | `app.live-state`                  |
| `LiveRoutines`              | the routine scheduler's `routines`: each live routine, with `enabled` and being there from its saved file                                                                                                                                                                                                                                                                                                                                                                                       | `app.scheduler-live-routines`     |
| `RoutineList`               | a workspace's routines with the trigger in words, the next run and the newest run each started                                                                                                                                                                                                                                                                                                                                                                                                  | `app.routine-list`                |
| `routineVersions`           | one routine for its page, live and saved, with the saved file's problems and its live state                                                                                                                                                                                                                                                                                                                                                                                                     | `app.routine-versions`            |
| `ChatService`               | chat outside a run: model turns through `RunExecutor.chatTurn`, the chat's tools run here, results fed back                                                                                                                                                                                                                                                                                                                                                                                     | `app.chat-turn-loop`              |
| `defaultTurnLimit`          | an answer makes at most 16 model turns unless given 1 to 64, and runs the last turn's tools before it stops                                                                                                                                                                                                                                                                                                                                                                                     | `app.chat-turn-limit`             |
| `ChatAnswerRequest.signal`  | Stop: passed on to the model turn and tools, a late model answer dropped, the calls left get a "Not run" result                                                                                                                                                                                                                                                                                                                                                                                 | `app.chat-stop`                   |
| `ChatAnswerEnd`             | a failed or stopped answer says whether a tool already ran, which decides "Try again"                                                                                                                                                                                                                                                                                                                                                                                                           | `app.chat-failure`                |
| `ChatAnswerListener`        | each model turn, tool call and added message as it happens, for the chat's status line                                                                                                                                                                                                                                                                                                                                                                                                          | `app.chat-progress`               |
| `AgentPlacement`            | where an agent's harness runs: a sandbox unless a person chose this computer for the file as it is now (`chosenAt`: when)                                                                                                                                                                                                                                                                                                                                                                       | `app.agent-placement`             |
| `RunHistory.listRuns`       | the newest real runs that match a filter, 20 unless a limit says otherwise, and how many match in all                                                                                                                                                                                                                                                                                                                                                                                           | `app.run-list`                    |
| `RunHistory.showRun`        | one run, real or test, by its full or short id: the summary worked out from its log, and the log, oldest first                                                                                                                                                                                                                                                                                                                                                                                  | `app.run-show`                    |
| `RunHistory.findRun`        | the run a typed id points to: the full id or the short id (`shortRunId`), in any case; the list is checked first, so a full id in capitals finds the run as stored on Windows; none, or several with the same end                                                                                                                                                                                                                                                                               | `app.run-short-id`                |
| `RunHistory.hasTestRuns`    | whether a workspace has test runs, so an empty run list can say it has only those                                                                                                                                                                                                                                                                                                                                                                                                               | `app.run-list-facts`              |
| `RunHistory.madeToolCalls`  | whether a run's log has a tool call, so the list can say a run sent nothing                                                                                                                                                                                                                                                                                                                                                                                                                     | `app.run-list-facts`              |
| `RunEvents.sendEvent`       | sends an event to a run only while it waits for it, answering the oldest waiting item; refuses with `RunEventRefused` otherwise                                                                                                                                                                                                                                                                                                                                                                 | `app.run-send`                    |
| `lookUpWorkflow`            | the workflow a typed id or `hub/id` points to; none, or several hubs with that id                                                                                                                                                                                                                                                                                                                                                                                                               | `app.workflow-lookup`             |
| `WorkflowRuns.startRun`     | starts the workflow a typed id or `hub/id` points to and follows the run; none or several start nothing                                                                                                                                                                                                                                                                                                                                                                                         | `app.run-start`                   |
| `WorkflowRuns.follow`       | a run's whole log until it ends or waits after a `seq`, missing no event; a signal stops following                                                                                                                                                                                                                                                                                                                                                                                              | `app.run-follow`                  |
|                             | subscribes again after the last event when the stream breaks, at most 3 times in a row without a new event                                                                                                                                                                                                                                                                                                                                                                                      | `app.run-follow-resubscribe`      |
|                             | an aborted signal also cancels the run, when the executor can; `RunFollowStopped` says whether it did                                                                                                                                                                                                                                                                                                                                                                                           | `app.run-cancel-on-abort`         |
| `FollowOptions.onEvent`     | each event as the follow reads it, oldest first, so a surface can draw while the run goes                                                                                                                                                                                                                                                                                                                                                                                                       | `app.run-follow-events`           |
| `TrustService.check`        | is a workspace trusted: its fingerprint against its record; a grant only on a match                                                                                                                                                                                                                                                                                                                                                                                                             | `app.trust-service`               |
| `TrustService.checkPlugin`  | the same for a plugin folder, whose record never shrinks; `grantPlugin` saves a person's trust                                                                                                                                                                                                                                                                                                                                                                                                  | `app.plugin-trust`                |
| `PluginService.load`        | finds every plugin folder at the top of the profile's plugin folder, sorted by name, and reads, checks and trust-checks each (`TrustService.checkPlugin`): a plugin with its trust status, or a `broken` one with every problem, or one whose trust record can't be read. A link or special file where a folder should be is broken; a file there is left out; one plugin never stops the others. It throws only when the plugin folder itself can't be listed                                  | `app.plugin-service`              |
| `PluginService.settings`    | a plugin's setting values, kept per computer in the profile's `RecordStore`: each saved one that still fits its setting, else the `default`, and none for a `secret` setting (its value goes to `Secrets`); `saveSettings` replaces them only when every value fits a declared setting and every required one is set, otherwise it saves nothing and gives every problem by setting                                                                                                             | `app.plugin-settings`             |
| `PluginService.secretNames` | the name each secret a plugin declares is kept under in `Secrets`: `plugin__<id>__<secret>`, so a plugin reads only secrets stored for it; no workspace can pick the prefix; the loader and a local tool's `env` read through it                                                                                                                                                                                                                                                                | `app.plugin-secret-names`         |
| `PluginService.forget`      | deletes a plugin's setting values, for Remove, and compacts the collection; the plugin's trust and other plugins' values stay, and so do its secrets, because `Secrets` is read-only in core: the host deletes the `secretNames` with its own secret writer                                                                                                                                                                                                                                     | `app.plugin-settings`             |
| `readPluginFolder`          | reads and checks one plugin folder: refuses over 2,000 files and folders, over 50 MB, a link or special file, or a folder without exactly one of `plugin.yaml` and `integration.yaml`, before any byte is read; then reads the manifest and runs its checks before any other file, so a plugin they refuse is never hashed, and counts the bytes it reads, so a file that grew past 50 MB since the listing stops the reads; hashes every file and parses the manifest from the bytes it hashed | `app.plugin-folder`               |
| `knowledgeHitForModel`      | a search hit as the model gets it, with title and snippet inside the untrusted fence; a hit whose `ref` is over 512 characters (`maxKnowledgeRefLength`) is dropped, so the model never gets it                                                                                                                                                                                                                                                                                                 | `ports.untrusted-knowledge`       |
| `knowledgeDocForModel`      | the same for a whole document: title and content fenced, and a document whose `ref` is over 512 characters dropped                                                                                                                                                                                                                                                                                                                                                                              | `ports.untrusted-knowledge`       |
| `ReviewService.accept`      | one change on an item page: accept moves the baseline, `reject` writes it back; stale changes change nothing                                                                                                                                                                                                                                                                                                                                                                                    | `app.review-accept-reject-change` |
| `ConnectionSettings`        | each connector's "allow sending", off without settings; only a person changes it, tool calls get the read side only                                                                                                                                                                                                                                                                                                                                                                             | `app.connection-settings`         |
| `readToolListing`           | the tools a server lists, checked, rebuilt and named `<source>__<name>`, with their texts marked untrusted, and the refusals                                                                                                                                                                                                                                                                                                                                                                    | `ports.untrusted-tool-listings`   |
| `toolForModel`              | the tool definition the model gets, with every text a server wrote inside the untrusted fence                                                                                                                                                                                                                                                                                                                                                                                                   | `ports.untrusted-tool-listings`   |
| `listedToolsNotice`         | the fixed system prompt line saying an outside server wrote the fenced tool texts, when a listed tool is offered                                                                                                                                                                                                                                                                                                                                                                                | `ports.untrusted-tool-listings`   |
| `checkToolCall`             | refuses arguments the offered parameters don't name, and asks before a tool above `read` runs                                                                                                                                                                                                                                                                                                                                                                                                   | `ports.untrusted-tool-listings`   |
| `checkOutsideRunCall`       | a connector call from chat runs only if the lists allow it, sending is on for `send`, and `checkToolCall` wouldn't ask                                                                                                                                                                                                                                                                                                                                                                          | `app.outside-run-connector-gate`  |
| `refusalStatusLine`         | one line of plain text for a refusal in the integration status, never for the model                                                                                                                                                                                                                                                                                                                                                                                                             | `ports.untrusted-tool-listings`   |
| `fenceUntrusted`            | puts outside text inside the untrusted fence, which holds when the text holds its markers                                                                                                                                                                                                                                                                                                                                                                                                       | `ports.untrusted-tool-listings`   |
| `checkPinVersion`           | refuses a `ConnectorPin` whose version isn't one exact version, such as a tag (`latest`) or a range (`^2.3.1`)                                                                                                                                                                                                                                                                                                                                                                                  | `app.connector-pin-version`       |
| `checkResolvedVersion`      | refuses a resolved package or version other than the pin's                                                                                                                                                                                                                                                                                                                                                                                                                                      | `app.connector-pin-version`       |
| `readPackageSpec`           | reads `name@1.2.3` (npm) or `name==1.2.3` (PyPI), and refuses no version, a tag, a range, a URL or a git source                                                                                                                                                                                                                                                                                                                                                                                 | `app.connector-pin-spec`          |
| `isPackageRunner`           | whether a command starts `npx`, `uvx` or another runner, any folder, case and ending, or via a shell; 10c's `unpinned` too                                                                                                                                                                                                                                                                                                                                                                      | `app.package-runner-launch`       |
| `checkPackageRunnerLaunch`  | refuses an inexact pin, a pin on a shell or other non-runner, and a pinned launch whose args or `env` could change what runs                                                                                                                                                                                                                                                                                                                                                                    | `app.package-runner-launch`       |
| `revertParts`               | sets some parts of an item's YAML back to a reference (latest version, assistant's baseline or run's base), keeping the rest                                                                                                                                                                                                                                                                                                                                                                    | `app.revert-parts`                |
| `describeWorkflowChange`    | one line per changed step or workflow field, each with the parts to undo it and the lines that can't be undone before it                                                                                                                                                                                                                                                                                                                                                                        | `app.change-line-parts`           |
| `describeAgentChange`       | one line per changed agent field or method, each with its part; instructions, access and sandbox marked important                                                                                                                                                                                                                                                                                                                                                                               | `app.change-line-important`       |
| `describeRoutineChange`     | one line per changed routine field, each with its part; what it runs marked important                                                                                                                                                                                                                                                                                                                                                                                                           | `app.change-line-important`       |
| `describeItemChange`        | any kind: the workflow, agent or routine describer, or one "Changed", "New" or "Deleted" line without parts                                                                                                                                                                                                                                                                                                                                                                                     | `app.change-parts-cut`            |

## Example

Opens a made-up `acme` workspace, edits one file, saves it and undoes the
edit. This example is [`examples/edit-save-undo.ts`](examples/edit-save-undo.ts),
which `src/example.test.ts` runs and checks.

```ts
import type { DefinitionStore, DefinitionWatch, Digest, WriteResult } from "@halonicjs/ports";
import { openWorkspace, workspaceFilesKey } from "@halonicjs/app";

const agentPath = "hubs/acme/agents/clerk.agent.yaml";

/**
 * Stands in for the platform's `Digest` adapter. The example never writes
 * with `expected` and the assistant changes nothing, so the bytes don't matter.
 */
const digest: Digest = { sha256: async () => new Uint8Array(32) };

/**
 * A few lines of in-memory store. Core may not use an adapter, so this stands in
 * for the memory adapter; a real store also refuses unsafe and private paths.
 */
class MapStore implements DefinitionStore {
  readonly location = "memory:acme";
  private writes = 0;

  private readonly files: Map<string, string>;

  constructor(files: Map<string, string>) {
    this.files = files;
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }
  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }
  async version(): Promise<string> {
    return `v${this.writes}`;
  }
  // The example saves without `expected`, so this store always writes.
  async write(path: string, content: string): Promise<WriteResult> {
    this.files.set(path, content);
    this.writes++;
    return { status: "written" };
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
    this.writes++;
  }
  // Nothing else changes the map, so there is nothing to watch.
  async watch(): Promise<DefinitionWatch> {
    return { close: async () => {} };
  }
}

/** Opens a made-up `acme` workspace, edits one file, saves, then undoes, and describes each step. */
export async function runExample(): Promise<string[]> {
  const store = new MapStore(new Map([[agentPath, "name: Clerk\n"]]));
  const scope = openWorkspace({
    store,
    reviewRecords: new MapStore(new Map()),
    digest,
    isTrusted: () => true,
    onListenerError: (error) => {
      throw error;
    },
  });
  const files = scope.services.get(workspaceFilesKey);
  const lines: string[] = [];
  // What a step left behind: the file in the store, what the workspace shows, and what is unsaved.
  const report = async (step: string): Promise<void> => {
    const unsaved = Object.keys(files.pending);
    lines.push(
      `${step}: store ${JSON.stringify(await store.read(agentPath))}, workspace ${JSON.stringify(await files.read(agentPath))}, unsaved: ${unsaved.length === 0 ? "nothing" : unsaved.join(", ")}`,
    );
  };
  // Every change and save sends an event; the labels tell what happened.
  scope.events.on("files.changed", ({ label }) => lines.push(`event: ${label}`));
  scope.events.on("files.saved", ({ paths }) => lines.push(`event: wrote ${paths.join(", ")}`));

  await report("opened");

  files.change("Renamed the agent", { [agentPath]: "name: Senior Clerk\n" });
  await report("edited");

  const saved = await scope.commands.execute("workspace.save");
  lines.push(`workspace.save wrote ${saved} file`);
  await report("saved");

  // Undoing the edit changes what the workspace shows and marks the file unsaved; the store keeps the saved text.
  await scope.commands.execute("workspace.undo");
  await report("undone");

  await scope.close();
  return lines;
}
```

### Adding a feature command

A feature adds its own commands and events with `declare module` on
`AppCommands` and `AppEvents`, then registers the one handler of each command.
This example is [`examples/feature-command.ts`](examples/feature-command.ts),
which `src/feature-command-example.test.ts` runs and checks.

```ts
import { type CommandSpec, WorkspaceScope } from "@halonicjs/app";

// A feature adds its commands and events to the workspace's own lists, so
// every name and payload is checked where it is used.
declare module "@halonicjs/app" {
  interface AppCommands {
    "agents.create": CommandSpec<{ name: string }, string>;
  }
  interface AppEvents {
    "agents.created": { id: string };
  }
}

/** Registers a made-up `agents.create` command, runs it once, and describes what happened. */
export async function runExample(): Promise<string[]> {
  const scope = new WorkspaceScope({
    location: "memory:acme",
    onListenerError: (error) => {
      throw error;
    },
  });
  const lines: string[] = [];
  scope.events.on("agents.created", ({ id }) => lines.push(`event: created ${id}`));

  // Exactly one handler per command; it answers the id of the new agent.
  scope.commands.register("agents.create", ({ name }) => {
    const id = name.toLowerCase().replaceAll(" ", "-");
    scope.events.emit("agents.created", { id });
    return id;
  });

  const id = await scope.commands.execute("agents.create", { name: "Senior Clerk" });
  lines.push(`agents.create answered ${id}`);

  await scope.close();
  return lines;
}
```
