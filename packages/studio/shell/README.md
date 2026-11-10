# @halonicjs/studio-shell

The Studio's feature registry and the contribution points features plug into, with the window's
frame and the parts inside it. The registry, the points and the window's state (announcer, close
stack, engine, save state, tabs) have no React; `ShellFrame`, `WindowTabStrip`, `Toolbar`,
`ToolbarSaveNote`, `StatusBarItems`, `EngineLine` and `SidebarResizeEdge` are React components.

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
look up services its feature lists in `needs` or `provides`; a service of its own feature is built
first, and a cycle between them throws a `ShellError`.

| Part                            | What it does                                               | Requirement               |
| ------------------------------- | ---------------------------------------------------------- | ------------------------- |
| `defineFeature`, `createShell`  | register features in dependency order; refuse bad graphs   | `shell.feature-registry`  |
| `serviceKey`, `studio.services` | provide services per workspace; lookups limited to `needs` | `shell.feature-services`  |
| `TabSet`                        | a workspace's window tabs, each with Back and Forward      | `shell.tab-set`           |
| `WindowTabStrip`                | the window tabs in the title bar, one Tab stop             | `shell.window-tab-strip`  |
| `ShellFrame`                    | the window's frame: layers, live regions, Esc, toasts      | `shell.frame`             |
| `StatusBarItems`                | the status bar's items, state only                         | `shell.status-bar`        |
| `shell.announcer`               | read text to screen readers, once per window               | `shell.announcer`         |
| `shell.closeStack`              | close the right layer on Esc and Android's Back            | `shell.close-stack`       |
| `Toolbar`                       | Back and Forward, the path, the badges and the save state  | `shell.toolbar`           |
| `shell.engine`                  | send and announce when the engine is lost and back         | `shell.engine-connection` |
| `EngineLine`                    | the one line while the engine isn't answering              | `shell.engine-line`       |
| `shell.engine.supervise`        | start the engine, restart it once, report why it failed    | `shell.engine-start`      |
| `saveFailureFor`                | turn a write error into a save reason                      | `shell.save-reasons`      |
| `SaveState`                     | the toolbar's save note and the failed-save toast          | `shell.save-state`        |
| `ToolbarSaveNote`               | the save note in the toolbar, and what it reads out        | `shell.save-note`         |
| `watchResources`                | read the engine's resource numbers, flag a low disk        | `shell.resource-numbers`  |

The shell adds Home itself. The other sidebar places come from features through `places.add`,
naming one of the fixed places (`sidebarPlaces`: Home, Inbox, Agents, Workflows, Routines, Library,
Runs, Changes); a feature that adds Home gets a `ShellError`. The shell lists them in that order and
leaves out a place no feature added, so a place whose feature hasn't landed is simply not there. The shell owns each place's name and icon (`placeNames`), so a feature
gives only the place, its view and its `signal`: the count or running dot, with the words a screen
reader hears after the name. `showPlace` gives what the sidebar shows, with nothing for a zero
(`shell.sidebar-places`).

Home's sections come from features the same way, through `home.addCard`, naming one of the fixed
sections (`homeSections`: Get set up, Needs you, Recent runs). The shell shows them in that order
under the `h1` "Home", each a region named by its heading from `homeSectionTitles`, and leaves out a
section no feature added. A card's view is a named export that gets `HomeCardProps`: the context of
the feature that added it (`shell.home-sections`). Each section loads and fails on its own: a card's
view suspends while it loads (as with React's `use`) and throws when it fails. The shell shows the
skeleton (none for Get set up), says "Loading Home" once for the page, and puts the section's
"Couldn't load" error with Try again in place of its rows (`shell.home-states`). Get set up's card
throws only once it knows setup isn't finished: if it can't tell, it shows nothing, so a workspace
that is set up never sees "Couldn't load setup".

Contributions are app-wide and added once, in `register`. Their callbacks (an explorer group's
`items`, an item action's `run`) get a `WorkspaceContext` for the open workspace; the layout builds
it with `shell.services.contextFor(featureId, registry)`. The layout reads everything back from
`shell.contributions`, for example `shell.contributions.itemPage.sectionsFor("agent")`.

## Window tabs

A `TabSet` holds one workspace's window tabs (design direction 2). Each tab has its own Back and
Forward, like a browser tab, that move exactly one place; `state.canGoBack` and
`state.canGoForward` say whether they can. `openHere` shows a place in the active tab and does
nothing when the tab shows it already; `openInNewTab` (a Ctrl-click) adds a tab right after it, keeps
the active one and returns `{ tab, added }`. A place open in another tab is never opened twice:
`openHere` switches to that tab, and `openInNewTab` returns it with `added: false` so the strip can
say it is already open. Home is the exception, because every new tab (`newTab`, + and Ctrl T) starts
there. Closing the active tab activates the one to its right, else
its left; closing the last tab leaves one on Home. `reopenClosed` (Ctrl Shift T) brings back the
last of up to 20 closed tabs with their history. `rename` updates a place's title in every tab, closed ones too. `back` and `forward` return `false`
at either end. `activate`, `cycle` (Ctrl Tab, wraps), `activateAt` (`-1` is the last tab), `move` and
`close` do what they say.

The strip reads `tabs.state` and `subscribe`s; every change makes a new state.

`WindowTabStrip` draws them in the title bar (component specs 24.5): a `tablist` named "Open tabs"
that is one Tab stop. `iconFor` gives a tab's 16px icon. ← and → move the focus, Enter or Space opens the focused tab, Delete closes
it, and Ctrl Shift PageUp and PageDown move it. A tab is named "Support reply, workflow", plus
", needs you" with the 6px dot when `needsYou` says its item waits for a person. Tabs are 200px
and shrink together to 96px, then the strip scrolls with the active tab kept in view. The ✕ keeps
its place on every tab and shows on the active one, on hover and on keyboard focus. **+** opens a
new tab on Home and calls `onNewTab`, so the frame can open Ctrl K there. Nothing on a tab is
`fg-subtle`. Dragging a tab moves it, with no motion: it jumps to its new place as the pointer
crosses a neighbour's middle. The window-wide keys (Ctrl T, Ctrl W, Ctrl Tab, …), the tab menu and
the tooltips come in later pull requests.

```tsx
<ShellFrame titleBar={<WindowTabStrip tabs={workspace.tabs} />} …>
```

## The frame

`ShellFrame` is the Studio window, in React. On the desktop it draws the three layers of design
direction 2: the 40px title bar on the halo, the panel with the toolbar as its first row and the
sidebar beside the page under it, and the 24px status bar. Below `PHONE_MAX_WIDTH` it shows the
page only (the phone's own bars come later) and switches as soon as the window crosses that width.
The parts inside read the layout with the kit's `usePresentation()`.

The frame also does the window-wide wiring once: it sets `<html lang>` (the Tabs hyphenate), mounts
the announcer's two live regions, routes every kit Dialog's regions to the announcer, tells the
announcer when the window has focus, passes Esc to the close stack, and shows `shell.toasts` in
one `ToastRegion` over the sidebar and the page, so a toast never covers the status bar. An Esc
inside an open `<dialog>` is left to the dialog, which cancels itself, so one press never closes two
layers. An Esc that ends an input method's composition is ignored. `phoneQuery` and
`usePresentationFromWidth` are the width check the frame uses.

```tsx
<ShellFrame
  announcer={shell.announcer}
  closeStack={shell.closeStack}
  engine={shell.engine}
  toasts={shell.toasts}
  language="en"
>
  {page}
</ShellFrame>;
```

## The toolbar

`Toolbar` fills the frame's 44px toolbar row (`h-toolbar`) for the active tab: Back and Forward,
then the path as a `nav` named "Location", then the header badges and the save state. `parentsOf`
gives the places above a tab's place, so a workflow reads "Workflows / Support reply"; each of
them is a link that opens in the active tab, or in a new tab on a Ctrl-click or a middle-click,
announced as "Opened Workflows in a new tab." (or "Workflows is already open in a tab.", with the
tabs left as they are). Back and Forward move focus to the new page's `h1`. With nowhere to go, they
stay in the Tab order as unavailable, and screen readers hear "Nothing to go back to" or "Nothing to
go forward to". The `badges` slot and the `saveState` slot (see `ToolbarSaveNote`) take no room when
they're empty. There's no Assistant button until the Assistant (T14) lands; the window-wide Back and
Forward keys and the path's tooltips come in later pull requests.

```tsx
<ShellFrame toolbar={<Toolbar tabs={workspace.tabs} announcer={shell.announcer} />} …>
```

## Status bar and toasts

The status bar shows state only: spend, the branch, the problems count. `StatusBarItems` draws the
items features added with `statusBar.add`, in their order, and goes in the frame's `statusBar`
slot. It isn't a live region: an item whose change matters announces it once through the
announcer. A result ("Saved key for Anthropic") or a failed command ("Couldn't remove _Classify_:
…") is a toast in `shell.toasts`, never a status bar message (microcopy 1.3).

```tsx
<ShellFrame
  toasts={shell.toasts}
  statusBar={<StatusBarItems items={shell.contributions.statusBar.list()} contextFor={contextFor} />}
  …
>
```

## Sidebar resize edge

`SidebarResizeEdge` goes right after the sidebar, before the page. It's an 8px hit area over the
sidebar's border that takes no room, with a 2px `accent` line on hover, while dragging and on
keyboard focus. Drag it, or Tab to it and use the window-splitter keys: ← and → by 16px, Home
180px, End 640px, Enter 264px (a double-click does the same). It's a `separator` named "Resize
sidebar" whose value a screen reader reads, so it sends nothing to the announcer. The sidebar owns
the width: `onResize` follows every move, `onResizeEnd` saves once the key or pointer is released.

```tsx
<nav id="sidebar" style={{ width }}>…</nav>
<SidebarResizeEdge width={width} sidebarId="sidebar" onResize={setWidth} onResizeEnd={save} />;
```

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
to listeners added with `shell.engine.on("engine.connection", listener)`. `shell.engine.connection`
is the state now, and `shell.engine.status` the last event with its details.

`shell.engine.stale` is `true` while the engine isn't answering after it had answered. Pages keep
what they showed, and the frame shows one line under the toolbar (`EngineLine`, VK T2-F30), never
one per section. Becoming stale is announced once, assertively, and answering again once, politely.
An engine that never answered isn't announced: the page that needed it shows "Couldn't load …"
with `shell.engine.words.notAnswering` as the reason. The words follow `createShell`'s `host`
(microcopy 2 and 19.2):

| `host`        | `notAnswering`, the reason                            | `showingLast`, the line and the announcement                         | `answeringAgain`               |
| ------------- | ----------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------ |
| `desktop-app` | The engine isn't answering. It may still be starting. | The engine isn't answering. Showing what it said last.               | The engine is answering again. |
| `served`      | Halonic on the server isn't answering.                | Halonic on the server isn't answering. Showing what it said last.    | Halonic is answering again.    |
| `phone`       | Halonic on your computer isn't answering.             | Halonic on your computer isn't answering. Showing what it said last. | Halonic is answering again.    |

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
`not-writable` (`EACCES`, `EPERM`, `EROFS`), `in-use` (`EBUSY`, and the Windows
`ERROR_SHARING_VIOLATION` and `ERROR_LOCK_VIOLATION`) or `failed` for anything else. The code and the original message stay in the result for
Copy details; they never go on screen (rule 4 of the failure-path guide).

## Save state

The Studio saves by itself (save model, HAL-1102), and the toolbar's save note is the only place
saving shows. A workspace has one `SaveState`; screens write through `save(item, write)`, which
never rejects and resolves to whether the item was saved. `note` says, most urgent first:
`failed` ("Couldn't save _Support reply_ · Try again", or "Couldn't save 2 items"), `items-not-saved` (a change from outside Halonic holds
items back, "1 item not saved · Compare"), `fields-not-saved` (fields with a mistake, "2 fields
not saved"), `saving` or `saved`. A failed write also shows a danger toast, "Couldn't save
_Support reply_: the disk is full." with **Try again**, worded from its save reason
(`couldNotSaveText`); `tryAgain()` and the toast run the same write again, and a new save of the
item closes the toast. Screens report fields with `setFieldsNotSaved` and outside changes with
`holdForOutsideChange` and `releaseHold`; `compare()` opens Compare for the item held back
longest. When an item is deleted or its tab closes, `forget(key)` drops it, with its toast.

`ToolbarSaveNote` goes in the toolbar's `saveState` slot. It shows "✓ Saved" (named "All changes
saved"), "Saving…" only once a write has run for 300ms, so quick saves don't blink, and the
problems after a warning or danger mark named "Warning" or "Error", with **Compare** or **Try
again**. It isn't a live region: `announceSaveNotes(saving, announcer)` reads the note out
politely, once, when it becomes items not saved, and never for Saving… or Saved. It stays quiet
for a failure too, since the danger toast is an alert that already reads it, with its reason.
`saveNoteWords` holds the words.

```tsx
announceSaveNotes(workspace.saving, shell.announcer);
<Toolbar
  tabs={workspace.tabs}
  announcer={shell.announcer}
  saveState={<ToolbarSaveNote saving={workspace.saving} />}
/>;
```

## Error messages

A screen with no text of its own for a failure passes the error and an `ErrorContext` to
`errorMessageFor(error, context)`, the one place the Studio turns an error kind into words
(microcopy 22 F13). The context holds the screen's "Couldn't…" `title` and what it knows, such as
the missing item's kind or the service that didn't answer. The kind picks the body and the one
action, which the screen wires up. A kinded error's message is the body unless the screen says
more. An `internal` error never shows its message: the body is "Halonic ran into a problem it can't
explain yet." with **Copy details**. A `conflict` offers **Load the latest** only when the item has
no unsaved edits; a file's own **Keep mine / Load theirs** wins over this message.

## Resource numbers

`watchResources({ read, timers, onError })` reads the engine's resource report: its memory, the
memory of each process it started, the disk space Halonic's data uses, the free space on the data
drive, and the local models Ollama has loaded (`loadedModels` is left out when Ollama didn't
answer, which is not the same as none loaded). `readResourceReport` checks what crossed the bridge
and throws a `ShellError` rather than pass on a number it can't trust.

It reads at once, then once a minute, timed from the end of the last read. A run, a download or a
model pull calls `check("run" | "download" | "model-pull")` before it starts; a check joins a read
that is already under way. Each reading has `lowDisk`, true below 1 GB free (`lowDiskBytes`).
`latest` is the last reading, `on("resources", listener)` hears each new one and `stop()` ends the
watch: nothing is read after it. A failed minute's read goes to `onError` and is read again the next
minute; a failed `check` rejects. Where Studio shows these numbers waits on the board (HAL-1720), so
this is the data only.

## Contribution points

A feature adds contributions through the points on the `Studio` that `register` receives. Each
contribution is a plain object (an object literal, not a class instance), and its id is letters,
digits and dashes joined by dots, such as `agents.new`. The shell lists them by `order`, then `id`,
and records the feature that added each (`Registered`). A bad id, a repeated id or adding after
`register` returned throws a `ShellError` naming the features.

- **Layout** (`shell.layout-points`): `itemKinds.add`, `explorer.addGroup`, `explorer.addSection`
  and `itemPage.addSection`. An item page section names a kind some feature adds, and the section's
  feature uses the page's feature only through its `api.ts` (`shell.feature-isolation`).
- **Frame** (`shell.frame-points`): `cards.add`, `panelWindows.add`, `statusBar.add`,
  `titleBar.add`, `phoneBar.add` and `settings.add`, with `places.add` and `home.addCard` above.
- **Commands** (`shell.commands`, `shell.keybindings`): `commands.add`, `keybindings.add`,
  `search.addProvider` and `persist`, which a feature calls at most once. A binding's `when` joins
  contexts with `&&`, each optionally `!`; of the bindings that hold, the one with the most
  conditions wins. `Mod` is `Cmd` when `createShell` gets `platform: "macos"`, else `Ctrl`.
  `shell.contributions.keybindings.resolve(keys, activeContexts)` finds the binding.

A view is a `ViewRef`: the name of a named export and a `load` that imports its module. `loadView`
takes the export, and throws a `ShellError` listing what the module does export when the name isn't
there (`shell.view-loading`).

## Other exports

The rest of `src/index.ts`, by area; the types are what the parts above take and return.

- **Announcer:** `createAnnouncer`, `announceQuietMs` (2 s), `Announcer`, `AnnouncerOptions`,
  `AnnounceOptions`, `Politeness`, `LiveRegion`, `LiveRegions`, `AnnouncerTimers`.
- **Close stack:** `createCloseStack`, `closeLayerKinds` (the ranks, in closing order),
  `CloseStack`, `CloseLayer`, `CloseLayerKind`, `EscapePress`.
- **Engine:** `createShellEngine`, `ShellEngine`, `ShellEngineState`, `EngineConnectionEvent`,
  `EngineConnectionListener`, `EngineStartEvent`, `EngineStartFailure`,
  `EngineStartFailureReason`, `EngineLauncher`, `EngineProcess`, `EngineProcessEvents`,
  `EngineSupervisor`, `engineAnswerTimeoutMs` (30 s), `engineRestartDelayMs` (2 s),
  `engineRestartWindowMs` (60 s), `engineWords`, `EngineWords`, `StudioHost`, `EngineLineProps`.
- **Frame:** `ShellFrameProps`, `StatusBarItemsProps`, `StatusBarItemProps` (what an item's view
  gets: `context`), `HomeCardProps`.
- **Sidebar:** `SidebarResizeEdgeProps`, `clampSidebarWidth`, `SIDEBAR_MIN_WIDTH`,
  `SIDEBAR_MAX_WIDTH`, `SIDEBAR_DEFAULT_WIDTH`.
- **Tabs and toolbar:** `TabLocation`, `WindowTab`, `TabSetState`, `OpenedTab`, `homeLocation`,
  `currentLocation`, `reopenableTabs` (20), `WindowTabStripProps`, `ToolbarProps`.
- **Save:** `SaveReason`, `SaveFailure`, `SaveNote`, `SavingItem`, `couldNotSaveText`,
  `SaveNoteWords`, `SaveNoteMark`, `SaveNoteAction`, `saveNoteActionLabels`,
  `ToolbarSaveNoteProps`, `SAVING_AFTER_MS` (300 ms).
- **Resources:** `ResourceWatch`, `ResourceWatchOptions`, `ResourceReading`, `ResourceListener`,
  `ResourceCheckReason`, `resourceCheckIntervalMs` (1 min), `lowDiskBytes`, `EngineResourceReport`,
  `ChildProcessUsage`, `LoadedModel`.
- **Errors:** `ErrorContext`, `ErrorMessage`, `ErrorAction`, `RulePlace`.
- **Features:** `Feature`, `FeatureDefinition`, `Shell`, `ShellOptions`, `Studio`, `ServiceKey`,
  `ServiceTarget`, `ServiceFactory`, `ServiceLookup`, `FeatureServices`, `WorkspaceContext`,
  `ViewRef`, `ShellError`.
- **Points:** `FramePoints`, `FrameContributions`, `LayoutPoints`, `LayoutContributions`,
  `CommandPoints`, `CommandContributions`, `Point`, `Ordered`, `Contributed`, `Registered`,
  `KeyboardPlatform`, and the contribution types: `CardContribution`, `PanelWindowContribution`,
  `BarItemContribution`, `PhoneBarContribution`, `SettingsSectionContribution`,
  `PlaceContribution`, `PlaceSignal`, `PlaceName`, `ShownPlace`, `SidebarPlace`,
  `HomeCardContribution`, `HomePoint`, `HomeSection`, `ItemKindContribution`, `ItemRef`,
  `ItemAction`, `TabBehaviour`, `TabDescription`, `ExplorerGroupContribution`, `ExplorerItem`,
  `ExplorerSectionContribution`, `ItemPageSectionContribution`, `CommandContribution`,
  `KeybindingContribution`, `SearchProviderContribution`, `SearchResult`, `PersistContribution`,
  `PersistedSession`.

## End-to-end tests

What jsdom can't show, such as a tab dragged with a real pointer, is checked in a real Chromium
with Playwright. Each part under test has a page in `e2e/pages` that renders it with the kit's real
CSS; `vite.config.ts` builds those pages, and the tests are `e2e/*.spec.ts`. `pnpm e2e` builds the
pages, serves them with `vite preview` and runs the tests. Only CI's `e2e` job runs them, because
only it has the browser: don't run them on the shared runner (HAL-2418). Read the result with
`gh pr checks`; a failed run uploads its report and traces as the `e2e-report` artifact.

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
