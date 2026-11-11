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

| Part | What it does | Requirement |
| --- | --- | --- |
| `defineFeature`, `createShell` | register features in dependency order; refuse bad graphs | `shell.feature-registry` |
| `serviceKey`, `studio.services` | provide services per workspace; lookups limited to `needs` | `shell.feature-services` |
| `TabSet` | a workspace's window tabs, each with Back and Forward | `shell.tab-set` |
| `WindowTabStrip` | the window tabs in the title bar, one Tab stop | `shell.window-tab-strip` |
| `hintKeys` | the Kbd keys of a shortcut, Ctrl or ⌘ for the platform | `shell.key-hints` |
| `TabPages` | the last 5 tabs' pages kept mounted, focus given back | `shell.tab-pages` |
| `ShellFrame` | the window's frame: layers, live regions, Esc, toasts | `shell.frame` |
| `StatusBarItems` | the status bar's items, state only | `shell.status-bar` |
| `shell.announcer` | read text to screen readers, once per window | `shell.announcer` |
| `shell.closeStack` | close the right layer on Esc and Android's Back | `shell.close-stack` |
| `Toolbar` | Back and Forward, the path, the badges and the save state | `shell.toolbar` |
| `shell.engine` | send and announce when the engine is lost and back | `shell.engine-connection` |
| `EngineLine` | the one line while the engine isn't answering | `shell.engine-line` |
| `shell.engine.supervise` | start the engine, restart it once, report why it failed | `shell.engine-start` |
| `saveFailureFor` | turn a write error into a save reason | `shell.save-reasons` |
| `SaveState` | the toolbar's save note and the failed-save toast | `shell.save-state` |
| `ToolbarSaveNote` | the save note in the toolbar, and what it reads out | `shell.save-note` |
| `watchResources` | read the engine's resource numbers, flag a low disk | `shell.resource-numbers` |

The shell adds Home itself. The other sidebar places come from features through `places.add`,
naming one of the fixed places (`sidebarPlaces`: Home, Inbox, Agents, Workflows, Routines, Library,
Runs, Changes); a feature that adds Home gets a `ShellError`. The shell lists them in that order and
leaves out a place no feature added, so a place whose feature hasn't landed is simply not there. The shell owns each place's name and icon (`placeNames`), so a feature
gives only the place, its view and its `signal`: the count or running dot, with the words a screen
reader hears after the name. `showPlace` gives what the sidebar shows, with nothing for a zero
(`shell.sidebar-places`). A signal that changes on its own, such as the Runs dot, also gives
`subscribeSignal`, and the sidebar reads it again each time it is told (`shell.place-signal-changes`).

Home's sections come from features the same way, through `home.addCard`, naming one of the fixed
sections (`homeSections`: Get set up, Needs you, Recent runs, Cards). The shell shows them in that order
under the `h1` "Home", each a region named by its heading from `homeSectionTitles`, and leaves out a
section no feature added. A card's view is a named export that gets `HomeCardProps`: the context of
the feature that added it (`shell.home-sections`). Each section loads and fails on its own: a card's
view suspends while it loads (as with React's `use`) and throws when it fails. The shell shows the
skeleton (none for Get set up), says "Loading Home" once for the page, and puts the section's
"Couldn't load" error with Try again in place of its rows. The errors aren't live regions: the page
says each reason once, each ending in a full stop (one that has none gets one, so two reasons aren't
read as one sentence), so when the engine isn't answering, screen readers hear it once, not once per
section, and the reasons take the place of "Loading Home" while other sections still load
(`shell.home-states`). Get set up's card
throws only once it knows setup isn't finished: if it can't tell, it shows nothing, so a workspace
that is set up never sees "Couldn't load setup". On a phone, the `h1` is for screen readers only
(the top bar shows "Home"), the sections run edge to edge 8px apart, and a loading section shows two
flush skeleton rows (`shell.phone-home`).

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
last of up to 20 closed tabs with their history. `closeOthers` keeps one tab and closes the rest,
which Ctrl Shift T brings back one by one in their places; `canReopenClosed` says whether any can
come back. `rename` updates a place's title in every tab, closed ones too, and tells
`subscribeToRenames` listeners, so a list that keeps places of its own renames them too. `back` and `forward` return `false`
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
crosses a neighbour's middle.

**The tab menu** opens with Shift F10 or the Menu key below the focused tab, with focus on its first
item, or with a right-click at the pointer, without making that tab active. It's the kit's
`ContextMenu`, named after the tab's title, with **Close**, **Close other tabs** (unusable on the
only tab) and **Reopen closed tab** (unusable until a tab has closed). After Close the focus goes to
the tab that took its place; after Reopen, to the reopened tab. Give the strip `windowKeys`, the same
`host` and `platform` as `useWindowKeys`: in the desktop app Close then shows Ctrl W and Reopen
closed tab Ctrl Shift T (⌘ on macOS). Served Studio shows no keys, since the browser owns them. The
tooltips come in a later pull request.

**Key hints** come from one helper, `hintKeys(keys, platform)`, so every hint reads the same. It
takes the keys as a keybinding writes them and returns one Kbd box per key: `Mod` is ⌘ on macOS and
Ctrl elsewhere, the modifiers come first, `Mod` always leading (⌘ Shift T, Ctrl Shift T), and Escape and the arrows
are drawn short (Esc, ↑). Name the same keys in `aria-keyshortcuts` with the kit's
`keyShortcutsLabel` (`shell.key-hints`).

```tsx
const keys = hintKeys("Mod+K", platform);
return (
  <button aria-keyshortcuts={keyShortcutsLabel(keys)}>
    Search <Kbd keys={keys} />
  </button>
);
```

In a narrow window (600 to 899px) the strip folds the tabs into one header badge, "3 open tabs ▾",
with **+** after it (component specs 24.5 T5). It shows the 6px dot and says "3 open tabs, 1 needs
you" (or "2 need you") while tabs need you, and counts every open tab: one reads "1 open tab". It
opens a kit Menu of the open tabs from its left edge, each with its icon, the needs-you dot and its
words, and the active one checked. A pick makes that tab active and the page takes the focus back
(`shell.open-tabs-menu`). The badge is part of `WindowTabStrip`, not a separate export; widening the
window shows the tabs again.

Each tab's tooltip is its full path, "Workflows / Support reply" (component specs 24.5,
`shell.cut-text-tooltips`), from the same `parentsOf` as the toolbar's. It describes the tab only
when there are places above the tab's own; a tab on Home is already named "Home".

```tsx
<ShellFrame titleBar={<WindowTabStrip tabs={workspace.tabs} parentsOf={parentsOf} />} …>
```

`useWindowKeys` binds the window-wide keys in the desktop app only: Ctrl T opens a tab (and calls
`onNewTab`, as **+** does), Ctrl W closes the active one, Ctrl Shift T reopens the last closed one,
Ctrl Tab and Ctrl Shift Tab cycle, Ctrl 1–8 go to that tab and Ctrl 9 to the last, and F6 moves the
focus to the toasts. On macOS it's Cmd instead of Ctrl, except for Ctrl Tab. In served Studio the
browser owns these keys and the Android app binds none either, so **+**, ✕ and the tab menu do the work. A
key is left alone while a modal dialog is open, while an input method composes, or when the page
already handled it. `windowKeyFor` is the headless reading of a press.

```tsx
useWindowKeys({
  host: "desktop-app",
  platform: "windows",
  tabs: workspace.tabs,
  toasts: shell.toasts,
});
```

`TabPages` draws the tabs' pages in the frame's `main` (UX checklist 1.2, a11y A3 and E2). The
pages of the last five active tabs (`mountedTabLimit`, chosen by `mountedTabIds`) stay mounted, the others hidden and inert,
so switching back keeps half-typed text. Each page is its own scroller. On a switch the page gets
back its scroll and its last focus, or else focus goes to its `h1`, as for an older tab whose page
was drawn afresh. While the focus is on a tab in the strip it stays there. A tab that moves on to
another place draws a fresh page. `focusPageHeading` only finds the shown page's `h1`.

`TabPages` also holds each page in a `PageErrorBoundary` keyed by its place, so a page that throws
stops alone, and shows `ItemGone` in a tab whose item isn't in the workspace any more (see Page
states). It knows which items are gone from `goneItem(location)`, which gives `{ kindName, place }`
or `undefined`; **Go to** opens `place` in that tab. Pass a new `goneItem` function when the
workspace's items change, or an open tab won't notice its item went. Without `goneItem`, no tab
shows `ItemGone`.

```tsx
<ShellFrame …>
  <TabPages tabs={workspace.tabs} renderPage={(location) => <PageFor location={location} />} />
</ShellFrame>
```

## The frame

`ShellFrame` is the Studio window, in React. On the desktop it draws the three layers of design
direction 2: the 40px title bar on the halo, the panel with the toolbar as its first row and the
sidebar beside the page under it, and the 24px status bar. Below `PHONE_MAX_WIDTH` it shows the
page between the phone's own bars (see Phone bars) and switches as soon as the window crosses that
width.
The parts inside read the layout with the kit's `usePresentation()`.

The frame also does the window-wide wiring once: it sets `<html lang>` (the Tabs hyphenate), mounts
the announcer's two live regions, routes every kit Dialog's regions to the announcer, tells the
announcer when the window has focus, passes Esc to the close stack, and shows `shell.toasts` in
one `ToastRegion` over the sidebar and the page, so a toast never covers the status bar. An Esc
inside an open `<dialog>` is left to the dialog, which cancels itself, so one press never closes two
layers. An Esc that ends an input method's composition is ignored. `phoneQuery` and
`usePresentationFromWidth` are the width check the frame uses.

In a narrow window (600 to 899px, `useNarrowWindow`) the sidebar folds into a Places button at the
toolbar's left. It opens the same sidebar as a 264px drawer over the scrim, with focus on the
current place; a pick, Esc, the scrim or the button closes it again (component specs 24.4). The
drawer is a `drawer` layer in the close stack. The sidebar fills the drawer there, and
`SidebarResizeEdge` hides itself. Widening the window docks the sidebar again without remounting
it.

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

## Phone bars

On a phone the frame shows `phoneTopBar` above the page and `phoneNavigation` below it, with the
engine's line between the top bar and the page (`shell.phone-bars`, component specs 15.1 and 15.2).
There are no window tabs and no status bar.

- `PhoneTopBar` is at least 56px plus the top safe area. `onBack` adds the 48px **Back** button at
  its left; leave it out at the top of a place. The title follows on one line, ending in "…", and
  `actions` go at the right (Search and the Assistant on a place, once they're built). The title
  isn't a heading: the page keeps its own `h1`.
- `BottomNavigation` is the `nav` named "Places": Home, Inbox and Runs where the features added
  them, then More, always. Where you are has the filled icon on the halo pill. Inbox's count and
  Runs' still dot sit at the icon's corner, and each link is named with its signal ("Inbox, 3
  waiting"). A tap calls `onSelect` with the place. Pass it only on a place or a list: an opened
  item leaves the bottom edge to its own bar.

```tsx
<ShellFrame
  phoneTopBar={<PhoneTopBar title="Inbox" />}
  phoneNavigation={<BottomNavigation places={shownPlaces} current="inbox" onSelect={switchPlace} />}
  …
>
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
they're empty. A part of the path cut with "…" shows its full title as a tooltip on hover and keyboard
focus, and none while it fits (`shell.cut-text-tooltips`); the item page's name field does the same.
Such a tooltip never names or describes its element, whose own text is already the full text. There's
no Assistant button until the Assistant (T14) lands; the window-wide Back and Forward keys come in a
later pull request.

```tsx
<ShellFrame toolbar={<Toolbar tabs={workspace.tabs} announcer={shell.announcer} />} …>
```

## Ctrl K palette

The palette's content is worked out without a DOM (design-search 2, component specs 24.3), and
`CommandPalette` draws it. `paletteGroups` takes the words, the open tabs'
places, the recent places, what the search providers found and the commands. With nothing typed it
gives Open tabs, then Recent places that no tab shows. With words typed it gives "Agents, workflows
and more" (open and recent places and found items whose name matches, each once) and Actions (the
commands whose title matches). `nothingFound` says when the "Nothing matches" line shows, and
`couldNotSearch` when nothing matches because a search provider failed, so the palette says
"Couldn't search" in its place. What other providers found still shows. Each
group keeps its best 5 rows, ordered by `matchName`: the whole name, then its start, then a word's
start, then anywhere, and among equals the more recently opened. A row a tab shows has `open`, so
it says "Switch to tab". A source that isn't built adds no group. A command's optional `source`, such as "Weather plugin", shows beside its title (the whole of it on hover; on a phone under the title), and a screen reader reads it after the title: "Show forecast, Weather plugin".

`matchName` reads the words as plain text, never as a pattern, so `workspace.yaml`, `{ input` and
`(EU)` find exactly that (`search.files.plain-text-is-literal`). Case doesn't matter (Greek final
sigma included), a run of spaces in a name matches one space, and there's no typo matching. Its `start` and `end` say which characters to highlight.

The palette's keys and options are worked out without a DOM too. `paletteOptions` lists the rows
group after group, as the combobox offers them. `paletteKeyFor` reads a press in the box: ↓ and ↑
move the active row and wrap (`movedActive`), Enter opens it here and Mod Enter in a new tab, Tab
stays in the box, and Mod K selects the words rather than closing the palette. Home and End are
left to the box. New words make the first row active, and for the same words a row the user picked
stays active when late results arrive (`keptActive`). `paletteOptionName` gives a screen reader
"Support reply, workflow, switch to tab", reading an item's kind by the name it was registered with
(pass `shell.contributions.itemKinds`), never its id, and `resultCountText` the count said politely
`resultCountDelayMs` (500 ms) after typing stops: "7 results", "1 result", "No results" or
"Couldn't search". When an action still shows under "Couldn't search", it says both: "Couldn't
search, 1 result".

`CommandPalette` is the dialog (VK T2-F6, F22 to F25): the kit's `PaletteBox` named "Search", the
search row as a `combobox` that keeps the focus and points at the active option, the groups as one
`listbox` with a `group` named by each title, 40px rows with the typed words marked and the active
one on the grey fill with the 2px accent bar, "Switch to tab", and the footer's keys. While
providers look, two still skeleton rows follow the names. "Nothing matches “refnud”." and
"Couldn't search" with the engine's reason and **Try again** sit above the Actions. It holds only
the active option; the screen that shows it owns the words, the content and what opening does.

```tsx
{
  searching ? (
    <CommandPalette
      words={words}
      onWordsChange={setWords}
      content={content}
      searching={pending}
      platform={platform}
      kinds={shell.contributions.itemKinds}
      notAnswering={shell.engine.words.notAnswering}
      announcer={shell.announcer}
      onOpen={open}
      onTryAgain={search}
      onCancel={() => setSearching(false)}
    />
  ) : null;
}
```

`searchProviders` asks every `search.addProvider` provider with its own feature's context and waits
for all of them. One that fails sets `failed` without hiding what the others found. Each provider
gets the context of its own feature for the palette's target, through
`(featureId) => shell.services.contextFor(featureId, target)`.

```ts
const contextFor = (featureId: string) => shell.services.contextFor(featureId, target);
const found = await searchProviders(words, shell.contributions.search.providers(), contextFor);
const content = paletteGroups({
  words,
  openTabs,
  recent,
  found: found.results,
  searchFailed: found.failed,
  actions,
});
```

`ShellPalette` joins all of this to a workspace (`shell.palette-wiring`). It owns the words and asks
the providers as they change through `usePaletteSearch`, which uses only the answer to the latest
words and keeps what was found for earlier words while it waits. `RecentPlaces` follows a tab set:
each place the active tab comes to show goes first, once, and a rename renames it there too, even
after its tab was closed. A
place or an item opens here, which closes the palette, or with Mod in a new tab through
`openLocation`, which keeps the palette open and says "Opened _Refund checker_ in a new tab." An
action closes the palette and runs with its own feature's context; one that fails shows the danger
toast "Couldn't run _New agent_." with the reason from `errorMessageFor`. `usePaletteKey` opens it on
Mod K, in the desktop app and served alike, but not over a modal dialog. K is read by the character
it types, or by its place on the keyboard on a layout without Latin letters, such as Russian. Its
empty box says "Search", and a place's row starts with the sidebar's outline icon for that place
(`paletteRowIcon`, `shell.palette-dialog`).

`usePaletteOpening` keeps whether the palette is open and binds Mod K; its `show` goes to
everything else that opens it (`shell.palette-entry`). `SidebarSearch` is the sidebar's Search box,
under the workspace switcher: a button that looks like a field, with the Kbd Mod K at its right and
in its `aria-keyshortcuts`. **+** and Ctrl T (desktop app only) open a new tab on Home and call
`onNewTab`, so passing `show` there opens the palette over the new tab, as UX 1.2 asks.

```tsx
const palette = usePaletteOpening(platform);
useWindowKeys({ host, platform, tabs: workspace.tabs, toasts: shell.toasts, onNewTab: palette.show });
<WindowTabStrip tabs={workspace.tabs} onNewTab={palette.show} />;
<SidebarSearch platform={platform} onOpen={palette.show} />;

if (!palette.open) return null;
return (
  <ShellPalette
    tabs={workspace.tabs}
    recent={workspace.recent}
    providers={shell.contributions.search.providers()}
    commands={shell.contributions.commands.list()}
    kinds={shell.contributions.itemKinds}
    contextFor={contextFor}
    announcer={shell.announcer}
    toasts={shell.toasts}
    notAnswering={shell.engine.words.notAnswering}
    platform={platform}
    onClose={palette.close}
  />
);
```

### On a phone

The top bar's Search opens the same palette as a phone sheet (`shell.phone-search`, component specs
24.3 "On a phone", VK T2-F15 to F19). `PhoneSearchSheet` draws it in the kit's `SheetFrame`:
**Close** and the title "Search", the field with the focus in it, its clear button and
`enterkeyhint="search"`, then the palette's groups with 56px rows that put the kind line under the
name. There is no footer and no Kbd. Enter opens the first row; the active row's bar shows only
once an external keyboard's arrow keys moved it, since touch has no active row. While providers
look, screen readers hear "Searching". `ShellPhoneSearch` joins it to a workspace like
`ShellPalette`, with no Open tabs group: every pick closes the sheet, then opens the place or item
with `onOpenLocation` or runs the action. **See all** and the Search page on a phone come with text
search, since their count is of text matches (T2-F16, F20).

```tsx
{searchOpen ? (
  <ShellPhoneSearch
    recent={recent}
    providers={shell.contributions.search.providers()}
    commands={shell.contributions.commands.list()}
    kinds={shell.contributions.itemKinds}
    contextFor={contextFor}
    announcer={shell.announcer}
    toasts={shell.toasts}
    notAnswering={shell.engine.words.notAnswering}
    platform={platform}
    onOpenLocation={places.open}
    onClose={() => setSearchOpen(false)}
  />
) : null}
```

`PhoneSearchButton` is the top bar's **Search** (`shell.phone-search-button`, component specs
15.1): a 48px icon button that opens `ShellPhoneSearch` and closes it itself. It takes the focus
when pressed, since a tap doesn't focus a button in every browser, so the sheet gives the focus
back to it on Close, Android back or a pick, before a picked page takes it. It goes in the top
bar's `actions` at the top of a place:

```tsx
<PhoneTopBar
  {...places.topBar}
  actions={
    places.topBar.onBack === undefined ? (
      <PhoneSearchButton {...searchProps} onOpenLocation={places.open} />
    ) : undefined
  }
/>
```

## Search page

The Search page finds anything in the workspace by its name or by the words inside it (VK T2-F7).
Each search is its own place: `searchPageLocation("refund")` is the place whose tab reads
"Search: refund", and `searchPageWords` reads the words back, so Back goes to the words searched
before. Only the words come back: the chips start again from their defaults.

`searchPageNames` works out its "Names and descriptions" section from what the search providers
found (`shell.search-page-names`). A provider may give a `description` with each result, which the
page searches too. The words are plain text, as in Ctrl K; the Match case and Whole word chips
narrow them through `findWords`, and the In and Hub chips narrow the items to one kind or hub.
Items whose name matches come first, ranked as Ctrl K ranks names (`matchName` with the page's
options, so the order agrees with the highlight), then those whose description alone matches.
Unlike Ctrl K, recently opened items don't come first among equals. An item two providers found
shows once, with the first description either gave. `kinds` and `hubs` are what the two
pickers offer. When nothing matches, `nothingFound` shows the empty state, with **Search all
hubs** while a hub is picked (`offerAllHubs`), and `couldNotSearch` replaces it when a provider
failed.

```ts
const found = await searchProviders(words, shell.contributions.search.providers(), contextFor);
const names = searchPageNames(
  { words, options: { matchCase, wholeWord }, scope: { hub } },
  found.results,
  found.failed,
);
```

`SearchPage` draws it (`shell.search-page`, VK T2-F7 and F26): the title and its sentence, the
search box, the In and Hub picker chips with Match case and Whole word, the count line
(`searchPageCount`, "2 matches in 2 items"), and the results with the words marked. The box and chips sit
in a `search` landmark. The count line is a status that also says "Searching…", and, when there is
no count, the title of the state that stands in for it ("Nothing matches", "Couldn't search"), so a
screen reader hears the search end.
The results follow the box as the user types, once the typing pauses for 300 ms,
in the same place. Enter with other words commits them: it opens their Search page in the same tab,
so the tab's title names them and Back brings the old words back. A result opens here, or with a
Ctrl-click in a new tab. "Searching…" shows still skeleton rows, and the page's states are
"Nothing matches", with **Search all hubs** while a hub is picked, and "Couldn't search" with
`shell.engine.words.notAnswering` and **Try again**. Until the engine searches the text of files,
there is no "Text inside" section and no Pattern chip, and the sentences say "name or description"
rather than "the words inside it". Mount `SearchPage` fresh for each place: the box and chips start
from `words` and their defaults only on mount, and `TabPages` does this by keying each page with its
`location.key`.

```tsx
<SearchPage
  words={searchPageWords(location) ?? ""}
  tabs={workspace.tabs}
  announcer={shell.announcer}
  providers={shell.contributions.search.providers()}
  contextFor={(featureId) => shell.services.contextFor(featureId, target)}
  kinds={shell.contributions.itemKinds}
  notAnswering={shell.engine.words.notAnswering}
/>;
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

## Sidebar places

`PlacesList` is the sidebar's `nav` named "Places": one link per place the features added, in the
fixed order, from `showPlace`. Where you are (an item counts as in its outermost parent, from
`parentsOf`) shows the filled icon in `accent` on the halo tint and is `aria-current="page"`. A
count or the still running dot shows after the name, and a screen reader hears its words after the
name ("Inbox, 2 waiting"). A click opens the place in the active tab and moves focus to the page's
`h1`; a Ctrl-click or a middle-click opens it in a new tab and says so, like the toolbar's path.

```tsx
<PlacesList places={shownPlaces} tabs={workspace.tabs} announcer={shell.announcer} />;
```

## Sidebar resize edge

`SidebarResizeEdge` goes right after the sidebar, before the page. It's an 8px hit area over the
sidebar's border that takes no room, with a 2px `accent` line on hover, while dragging and on
keyboard focus. Drag it, or Tab to it and use the window-splitter keys: ← and → by 16px, Home
180px, End 640px, Enter 264px (a double-click does the same). It's a `separator` named "Resize
sidebar" whose value a screen reader reads, so it sends nothing to the announcer. The sidebar owns
the width: `onResize` follows every move, `onResizeEnd` saves once the key or pointer is released.
The narrow window has no edge.

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
close the first layer by rank (inline edit, menu, tooltip, dialog or sheet, drawer,
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

| `host` | `notAnswering`, the reason | `showingLast`, the line and the announcement | `answeringAgain` |
| --- | --- | --- | --- |
| `desktop-app` | The engine isn't answering. It may still be starting. | The engine isn't answering. Showing what it said last. | The engine is answering again. |
| `served` | Halonic on the server isn't answering. | Halonic on the server isn't answering. Showing what it said last. | Halonic is answering again. |
| `phone` | Halonic on your computer isn't answering. | Halonic on your computer isn't answering. Showing what it said last. | Halonic is answering again. |

On the desktop the app starts the engine process instead: it hands an `EngineLauncher` to
`shell.engine.supervise(launcher)`. The shell sends `starting { attempt, since }` at once, then
`connected` when the engine answers. A start that fails sends `failed { failure }` with one of
three reasons, and the shell doesn't try again by itself:

| Reason | When |
| --- | --- |
| `stopped-while-starting` | the process ended first; `exitCode` is kept |
| `no-answer` | no answer within 30 s; the process is stopped |
| `data-folder-not-writable` | the engine reported it can't write its data |

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

## Page states

The states every page shares, so no feature words them on its own:

- **A page that stops working.** `TabPages` already puts each tab's page inside a
  `PageErrorBoundary`; for a page drawn elsewhere, use
  `<PageErrorBoundary pageKey={item.id} pageName="Support reply">`. If the page throws while it
  draws, only its area shows "This page stopped working" with the reason naming the page, **Reload
  page** and the link **Copy details** (microcopy 22 F14); the sidebar and the other tabs keep
  working. Focus goes to the title only if it was lost, and to this page's own `h1` after a Reload
  page that works. The error's message goes only into Copy details. When `pageKey` changes, such as
  when the tab opens another item, the boundary starts fresh.
- **Copy details.** `useCopyDetails()` copies `detailsOf(what, error)` through the frame's
  clipboard and says "Copied. Paste it into a bug report." or "Couldn't copy." in a toast (22 F13b).
  Outside React, such as in a toast's action, `copyDetails(details, toasts)` does the same.
  **Report a problem ›** waits until the Studio has a place it opens.
- **An item that's gone.** `TabPages` shows it for a tab whose `goneItem` answers; elsewhere,
  `<ItemGone kindName="run" place="Runs" onGoTo={…} />` says "This run
  isn't in this workspace any more." with **Go to Runs**, and moves focus to its title (microcopy 2,
  "Item gone"). An item moved to the trash isn't gone: its feature shows the "moved to the trash ·
  Undo" strip.
- **Loading and couldn't load** come from the kit: a List's `loading` and `loadingLabel`, and the
  error-tone `EmptyState` "Couldn't load _things_" with `shell.engine.words.notAnswering` as the
  reason when the engine doesn't answer.

## Stacked cards

An item page's cards (`shell.card-stack`) are a plain `CardStack`, the bottom card first, kept in
the page's state. The functions take a stack and return the next one, or the same stack when
nothing changed:

- `openCard(stack, card)` puts a card on top. A card already in the stack isn't opened twice: the
  stack goes back to it. A `docked` card always goes to the bottom, so it closes every card open.
- `backToCard(stack, level)` closes the cards above a breadcrumb part or a card behind; `-1` closes
  them all. `closeTopCard(stack)` is Esc, the ← arrow and the empty room round the cards.
- `dropGoneCards(stack, exists)` drops a card whose part is gone and every card above it, and
  returns the `removed` card so the page can say "_check_ was removed.".
- `shownCards(stack)` is the top card and at most two behind it. `cardPath` gives the breadcrumb,
  `topCardName` the name of the top card's title ("draft-reply, in Acme Mail › Writer ›
  draft-reply"), and `dockedCardCoversPanel(width)` says when a docked card covers the panel
  (below 720px).

`StackedCards` draws the stack over a view (`shell.stacked-cards`, component specs 16, VK T6-F3):

```tsx
<StackedCards
  itemPath={["Acme Mail", "Writer"]}
  stack={cards}
  onChange={setCards}
  closeStack={shell.closeStack}
  panelWidth={width}
  renderCard={(card) => <TaskCard card={card} />}
>
  <AgentMap onOpen={(card) => setCards(openCard(cards, card))} />
</StackedCards>;
```

- **The top card** is `surface-raised` with `shadow-2`: **←** ("Back"), the breadcrumb ("Card
  path"), **✕** ("Close all cards" while more than one card is open, else "Close"), then the
  title, named "draft-reply, in Acme Mail › Writer › draft-reply". The feature draws the body
  under it.
- **Cards behind** are bands only, 10px higher (`--stack-peek`) and 12px narrower on each side
  (`--stack-inset`) per step back, on `--stack-shade-1` and `--stack-shade-2`, with no shadow. A
  docked card behind stays full width. Their bodies aren't kept, so a feature keeps what a card
  needs in its own state. Nothing moves.
- **Full cards** dim the view with `--stack-scrim` and make it inert. **A docked card alone** takes
  the panel's right 480px with the view usable and undimmed, or the whole panel under 720px.
- **Back:** Esc (a `stacked-card` or `docked-card` layer, only on the shown tab's page), **←** and
  the scrim close the top card; a breadcrumb part or a band goes back to its level, the item's own
  name closing every card; **✕** closes every card.
- **Focus:** an opened card's title takes it; a closed card gives it back to what opened it, else
  to the title of the card now on top. When `dropGoneCards` removes a card, the feature that
  called it announces "_check_ was removed."; `StackedCards` doesn't.

## Side panel width

An item page's side panel (`shell.panel-width`) is 420 to 1400px wide, 700px until someone drags
it. The width is the same for every item page in the window, and the host saves it on this
computer, as it does the sidebar's: it mounts `PanelWidthProvider` once around the tabs' pages,
with what was saved and how to save it. Outside one (a test, a preview), each page starts at 700px
and saves nothing.

```tsx
<PanelWidthProvider saved={settings.read("panelWidth")} onSave={(width) => settings.write("panelWidth", width)}>
  <TabPages … />
</PanelWidthProvider>
```

- `savedPanelWidth(saved)` reads the saved value back: kept inside 420 to 1400, or 700px for
  anything that isn't a finite number. `clampPanelWidth(width)` keeps a drag inside 420 to 1400.
- `shownPanelWidth(width, tabWidth)` is the width drawn: narrowed so the chat keeps 320px, never
  under 420px, and the chosen width again once the tab widens. It is `undefined` when a 420px panel
  doesn't fit beside a 320px chat (with the 48px gap and the 40px lead, a tab under 828px);
  `panelFitsBeside(tabWidth)` says the same. Then the item page shows the panel as a button.

- While the panel is beside the chat, `ItemPage` draws its left edge as a window splitter named
  "Resize panel", the same edge as the sidebar's: a drag; ← wider and → narrower by 16px; Home
  420px, End as wide as leaves the chat 320px; Enter and a double-click 700px. The width is saved
  when the key or the pointer is released. `panelEdgeLimits(tabWidth)` gives those limits.

## Phone places and Back

On a phone (`shell.place-stacks`) there are no window tabs: the bottom navigation has four places,
Home, Inbox, Runs and More, and each keeps its own stack of pages. `PlaceStacks` is a plain value,
the place shown and each stack with its top page first. The functions take one and return the
next, or the same one when nothing changed:

- `switchPhonePlace(stacks, place)` is a tap in the bottom navigation: another place shows where the
  user left it, the place already shown goes back to its top.
- `openPhonePage(stacks, location, { list })` opens a page in the place shown. A sidebar place
  opens where it lives (`phonePlaceOf`): Inbox and Runs at their top, Agents, Workflows, Routines,
  Library and Changes as lists right above the More page. Settings (`settingsLocation`) opens there
  too, though it isn't a sidebar place. `list: true` marks a page that is still a
  list, such as the Library's Skills, so the bottom navigation stays.
- `openPhonePageIn(stacks, place, location)` follows a link to another place's page (a waiting run's
  "Review in Inbox"): that place shows with the page on top, and Back from it comes back.
- `goBackOnPhone(stacks)` is Back: one page up, or to Home from the top of Inbox, Runs or More. At
  the top of Home it returns `undefined`, and the app leaves.
- `isAtPlaceTop` says when the top bar has no Back button, `showsBottomNavigation` when the bottom
  navigation shows (on a place or a list, never on an opened item), and `currentPhonePage` gives
  the page whose title the top bar shows.

### The More page

`MorePage` (`shell.more-page`, component specs 15.2) is the page at the top of More. It shows the
workspace switcher row ("Workspace: Acme. Change workspace", which opens T3's picker sheet) once
the app passes one, the
header badge on its own line when there is one, a flush List of the places that live under More,
in the sidebar's order and only where a feature added them, and the line "Editing workflows is
easier on a computer.". Changes shows its count in place of the chevron. The top bar says "More",
so the page's `h1` is for screen readers only.

```tsx
<MorePage
  switcher={{ workspace: { name: "Acme", folder: "~/Work/acme" }, onChange: openWorkspacePicker }}
  places={shownPlaces}
  onOpen={(place) =>
    setStacks(openPhonePage(stacks, { key: place, title: placeNames[place].label }, { list: true }))
  }
/>;
```

Not yet: Settings joins the list when T11 adds it with its icon.

### Joined, and Android's back

`usePhonePlaces()` keeps the place stacks and gives what the bars need (`shell.phone-back`): the
top bar's title and Back (only under a place's top), the bottom navigation's props (or `undefined`
on an opened item, where it hides), and `open`, `openPlace`, `openIn` and `back`. Every move that
changes the page takes focus to the new page's `h1`, as on the desktop.

`usePhoneBackButton(enabled, closeStack, places)` handles Android's back, and the browser's when
the Studio is served on a phone. The press arrives as a step back in the page's history, so the
shell keeps one entry of its own on top and puts it back after each press. `pressPhoneBack` decides
what a press does: an open modal dialog cancels first (the innermost, when one is open inside
another), then the close stack's first layer closes, and only then the app goes back. At the top of
Home it lets the press through, and the Studio is left. When the Studio is the first page in its
browser tab, that press can't leave, so the next page move puts the entry back.

```tsx
const places = usePhonePlaces();
usePhoneBackButton(presentation === "phone", shell.closeStack, places);

<ShellFrame
  phoneTopBar={<PhoneTopBar {...places.topBar} />}
  phoneNavigation={
    places.navigation && <BottomNavigation places={shownPlaces} {...places.navigation} />
  }
>
  {places.page.location.key === "more" ? <MorePage onOpen={places.openPlace} /> : page}
</ShellFrame>;
```

## Item page

`ItemPage` is the frame the features draw an agent's, a workflow's or another item's page in (UX
checklist 1.10). The feature owns the item; the shell draws the header and keeps the picked view:

```tsx
<ItemPage
  icon={<WorkflowIcon />}
  kind="Workflow"
  name={workflow.name}
  onRename={rename}
  actions={[{ id: "delete", label: "Delete…", danger: true, onSelect: askToDelete }]}
  views={[
    { id: "flow", label: "Flow" },
    {
      id: "configuration",
      label: "Configuration",
      count: { value: 2, tone: "danger", name: "2 errors" },
    },
    { id: "runs", label: "Runs", count: { value: 1, tone: "warning", name: "1 needs you" } },
  ]}
  end={<RunButton />}
>
  {(view) => <WorkflowView view={view} />}
</ItemPage>;
```

- **The header** is 52px and stays at the top while the view scrolls: the kind's icon, the kind in
  small caps and the name as a rename field (the page's `h1`), the ⋮ menu when there are
  `actions`, the views nav centred ("Workflow views"), and `end` at the right.
- **Rename:** Enter or leaving the field keeps the trimmed name; an empty one puts the old name
  back. Esc puts the old name back and that press does nothing else; with the name unchanged, Esc
  goes on to the close stack.
- **One view at a time,** remembered for the window tab and the item, even when the tab's page was
  unmounted (`TabPages` keeps it). A tab that shows the item for the first time starts on the first
  view. A page that draws its own header can use `ItemHeader` and `useRememberedView` itself.
- **Badges** are the kit tabs' `count` (`danger` errors, `warning` waiting for a person) and
  `running` dot.
- **The chat** (`shell.item-page-chat`): when a feature provides a `chat` for the kind, the chat
  sits on the left and the view in a panel on the right, 700px wide or narrowed so the chat keeps
  320px (`shell.panel-width`). Without one, the view takes the full width with no other controls.
  - `chat={{ startsOpen: true, render: (close) => <TryIt close={close} /> }}`. A chat that doesn't
    start open shows as "Ask about this <kind>…" in the header; `close` brings that back.
  - The panel's ✕ ("Close Flow") hides it and the views nav; the chat centres at reading width,
    and a "Flow" button shows the panel again.
  - A tab with no room for a 420px panel beside the chat shows only the chat with the same button,
    which opens the panel as the tab's own screen with **← Chat**.
  - Focus moves to what took the pressed control's place.
  - The chat and the view stay mounted through every switch, hidden rather than moved, so a
    half-typed message or the canvas's zoom survives. A chat provided after the first render still
    starts open until the user opens or closes it.
- **Maximise** (`shell.panel-maximise`): beside the chat, ⤢ "Maximise Flow" sits before the ✕,
  with its name as its tooltip. It makes the panel cover the tab's body inside a 112px margin over
  the dimmed, inert chat, and becomes the restore mark "Restore Flow", keeping the focus. The restore
  mark, Esc (a `maximise` layer, once cards above it have closed; pass `closeStack`) or a click in
  the margin puts the panel back at its width. There is no resize edge while it's maximised, and no
  ⤢ where the panel shows as a button. A tab that gets too narrow for the panel ends maximise, so
  widening it again shows the panel beside the chat.
- **Not yet:** the "Changes not live yet" line (24.9). A feature draws its stacked cards with
  `StackedCards` inside its view.

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
  A settings section names its `scope` (`workspace`, `display` or `host`: where its values are
  saved), may give a `summary` for the phone's list and `phone: false` to stay off a phone. The
  settings list shows the workspace's group, then "On this computer", each by `order`
  (`bySettingsGroup`); features never write headings. `settingsSectionToOpen` picks the section
  `settings.open` shows (`shell.settings-open`).
- **Commands** (`shell.commands`, `shell.keybindings`): `commands.add`, `keybindings.add`,
  `commands.addSource`, `search.addProvider` and `persist`, which a feature calls at most once. A binding's `when` joins
  contexts with `&&`, each optionally `!`; of the bindings that hold, the one with the most
  conditions wins. `Mod` is `Cmd` when `createShell` gets `platform: "macos"`, else `Ctrl`.
  `shell.contributions.keybindings.resolve(keys, activeContexts)` finds the binding.
  A command source (`shell.command-sources`) is `{ id, commands }`, for commands that come and go
  while Studio runs, such as those of the plugins that are on. Each time the shell lists commands or
  looks one up, it calls `commands()` again and lists what it gives with the feature that added the
  source. A command of a source must be readable, have an id that starts with the source's id and a
  dot, be a valid id and not repeat one, have a `title` that is text and, when it has a `source`,
  one that is text, or it is left out (one unreadable command, such as a getter that throws, drops
  only itself); a source that throws or gives no list gives none, and the other commands still show. Two sources with one id, or a command or source whose id starts with a
  source's id and a dot, throw a `ShellError` naming both.

A view is a `ViewRef`: the name of a named export and a `load` that imports its module. `loadView`
takes the export, and throws a `ShellError` listing what the module does export when the name isn't
there (`shell.view-loading`).

## The Studio window

`StudioWindow` puts the desktop window together for one open workspace (`shell.studio-window`):
`WindowTabStrip` in the title bar, the `Toolbar` with `ToolbarSaveNote`, the sidebar
(`SidebarSearch`, `PlacesList` and `SidebarResizeEdge`, with `WorkspaceSwitcher` once the app passes
a workspace menu), `TabPages` and `StatusBarItems`, and the Ctrl K palette, opened from the Search
box, Mod K, **+** and Ctrl T. A tab on Home shows `HomePage`, a tab on a search the `SearchPage`,
and a tab on a place a feature added that place's view, which gets `PlaceViewProps`: the context of
the feature that added it. A tab on an item (`kind/hub/id`) shows the `open` view of the kind a
feature added, which gets `ItemViewProps`: the item and the context of that feature
(`shell.item-tabs`). The view is imported the first time a tab shows an item of that kind.

On a phone the same window shows the phone's layout (`shell.studio-phone`): `StudioPhoneTopBar`
(the page's title, Back under a place's top, and **Search** at a place's top, opening the Search
sheet), `StudioPhonePage` (Home or a place's view, as on the desktop, or the `MorePage` at the top
of More, with its switcher row once the app passes `phoneSwitcher`), and the `BottomNavigation`.
Android's back goes through `usePhoneBackButton`. The phone keeps its own places next to the
desktop's tabs, so a window that crosses the phone width comes back to where each layout was. Ctrl
K's palette is the desktop's; a phone searches in its Search sheet. `shownPlaces` reads the places
with their signals for the sidebar, the bottom navigation and the More page alike.

While no workspace is open the window is `WelcomeWindow` (`shell.welcome-open`): the `Welcome`
screen in the shell's frame, with no tabs, toolbar, sidebar or status bar, and the app's name alone
as the title. `Welcome` shows "Halonic Studio" and **Open folder**, which reads "Opening…" while the
folder opens. A folder that fails says "Can't open *folder*: *reason*" (`cantOpenProblem`, with the
reasons in `cantOpenWords`), and **Copy details** when Halonic can't explain it
(`shell.welcome-cant-open`).

`StudioWorkspace` is the window's state for one workspace: its `tabs`, `recent` (Ctrl K's Recent),
`saving` and `services`. Create one when the workspace opens and `dispose()` it when it closes.
Give it the workspace's `name`, once the app knows it, for the window's title: the window keeps
`document.title` as "Home · Acme · Halonic", the page shown (the active tab's, or on a phone the
phone place's page), the workspace and the app, following switches, the desktop's renames and
phone moves, and leaves the workspace out while its name is missing or empty (`shell.window-title`).

```tsx
shell.services.instantiate(registry);
const workspace = new StudioWorkspace({ toasts: shell.toasts, services: registry });
<StudioWindow shell={shell} workspace={workspace} host="desktop-app" platform="windows" language="en" />;
```

`mountStudioWindow` draws that window into an element of the page and returns `unmount()`
(`shell.studio-mount`). The served Studio's entry uses it (the desktop app draws its window with
the workspace feature's `mountWorkspaceWindow`), so React stays inside the Studio packages and
`apps/studio` only starts the window. The window's CSS entry, `src/studio.css` (Tailwind, the kit's
tokens and the `@source` over `packages/studio`), is the package's `style` export, so the page's CSS
is one line, `@import "@halonicjs/studio-shell";`:

```ts
const studio = mountStudioWindow(root, { shell, workspace, host: "served", platform, language: "en" });
// when the workspace closes:
studio.unmount();
workspace.dispose();
```

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
- **Side panel:** `PANEL_DEFAULT_WIDTH` (700), `PANEL_MIN_WIDTH` (420), `PANEL_MAX_WIDTH` (1400),
  `CHAT_MIN_WIDTH` (320), `ITEM_PAGE_LEAD` (40), `PANEL_GAP` (48), `PanelWidthProviderProps`.
- **Search page:** `SearchScope`, `SearchPageQuery`, `NameResult`, `SearchPageNames`.
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
  `CommandSource`, `KeybindingContribution`, `SearchProviderContribution`, `SearchResult`, `PersistContribution`,
  `PersistedSession`.

## End-to-end tests

What jsdom can't show, such as a tab dragged with a real pointer, is checked in real Chromium and
WebKit with Playwright (Tauri uses WebKit on macOS and Linux, WebView2 on Windows). Every spec runs
in both projects. Each part under test has a page in `e2e/pages` that renders it with the kit's real
CSS; `vite.config.ts` builds those pages, and the tests are `e2e/*.spec.ts`. `pnpm e2e` builds the
pages, serves them with `vite preview` and runs the tests. Only CI's `e2e` job runs them, because
only it has the browsers: don't run them on the shared runner (HAL-2418). Read the result with
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
