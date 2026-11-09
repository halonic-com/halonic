# @halonicjs/studio-kit

The Studio's design tokens: every colour, text style, size, radius, shadow and motion value, in one
file (`src/theme.css`), for light and dark mode, and the shared base components, which arrive one
by one. So far: [`Button`](#button), [`Card`](#card), [`StatusChip`](#statuschip), [`Tabs`](#tabs),
[`List`](#list), [`Kbd`](#kbd), [`Field`](#field), [`Input`](#input), [`TextArea`](#textarea),
[`CopyButton`](#copybutton) and [`ExternalLink`](#externallink).

- **Layer:** studio
- **Owner:** noah
- **Public API:** `@halonicjs/studio-kit` (the tokens are CSS, imported from CSS; the components
  are named exports)

## Example

The app's entry CSS sets up Tailwind once and then imports the tokens. Plain CSS `@import` of the
package name resolves to `theme.css` through the `style` export condition.

```css
/* apps/studio/src/app.css */
@import "tailwindcss";
@import "@halonicjs/studio-kit";

/* Required, not optional: the kit and the Studio packages reach the app through node_modules
   links, and Tailwind skips node_modules. The paths are relative to this file. */
@source "../../../packages/studio";
/* READMEs and AGENTS.md files mention classes too, including the "not allowed" examples below;
   without this line those would end up in the app's CSS. */
@source not "../../../packages/studio/**/*.md";
```

Then use the token classes in markup:

```html
<aside class="w-sidebar bg-surface-subtle text-body text-fg max-wide:hidden">
  <a class="flex h-control-md items-center gap-2 rounded-sm px-2 bg-halo-tint focus-ring-inset">
    Agents
  </a>
</aside>
```

`wide:` is the full layout (900px and wider) and `max-wide:` the compact one, where the sidebar
collapses.

Code that needs a value outside CSS (a canvas, a code editor theme) reads the CSS variable, such as
`var(--color-surface)`, never a copied hex value.

## Light and dark

Each colour is written once as `light-dark(light, dark)`, so there are no `dark:` classes. The
mode comes from `color-scheme`:

| On `<html>`          | Mode                         |
| -------------------- | ---------------------------- |
| nothing              | follows the system setting   |
| `data-theme="light"` | always light (user override) |
| `data-theme="dark"`  | always dark (user override)  |

**Minimum webviews**, because `light-dark()` needs them: WebKit from Safari 17.5 (WebKitGTK 2.44 on
Linux), Chromium 123 (WebView2 on Windows, Android WebView) and Firefox 120. If that turns out too
strict for the Linux versions we support, the fallback is a `[data-theme="dark"]` block with the
dark values; that decision belongs to the first `apps/studio` pull request.

## What the tokens give you

| Token                                                    | Classes                                           |
| -------------------------------------------------------- | ------------------------------------------------- |
| `--color-*`                                              | `bg-surface`, `border-border`, `text-fg-muted`    |
| `--text-*` (size, line height and weight together)       | `text-caption` … `text-display`, `text-code`      |
| `--spacing` (a 4px grid)                                 | `p-4` = 16px, `gap-2` = 8px                       |
| `--spacing-control-*`, `-titlebar`, `-statusbar`, others | `h-control-md`, `h-statusbar`, `w-sidebar`        |
| `--radius-*`, `--shadow-*`, `--ease-*`, `--animate-spin` | `rounded-md`, `shadow-2`, `ease-enter`            |
| the halo                                                 | `bg-halo-frame`, `-tint`, `-wash`, `-line`        |
| the focus ring (keyboard focus only)                     | `focus-ring`, `focus-ring-inset` for list rows    |
| a selected row's mark                                    | `selected-bar`, `selected-forced`                 |
| Windows high-contrast mode only                          | `text-forced-disabled`                            |
| `--breakpoint-wide`                                      | `wide:`, `max-wide:` (compact)                    |
| `--duration-*`, `--layer-*` (plain variables)            | `duration-(--duration-base)`, `z-(--layer-toast)` |

The theme starts from `--*: initial`, so Tailwind's own palette and scales don't exist:
`bg-red-500`, `rounded-3xl`, `text-sm` and `shadow-lg` produce no CSS. Two things still compile and
are not allowed: arbitrary values (`p-[13px]`, `text-[#333]`) and numeric z-index classes
(`z-50`), which Tailwind doesn't take from the theme. Use `z-(--layer-*)` instead.

## Motion, for now

Colour changes and short fades only. Nothing slides, scales or moves on its own, cards don't lift
with motion, and status dots stay still. The one exception is the busy spinner (`animate-spin`).
The curves and durations stay in the file for later.

## Checks

`pnpm turbo run test --filter=@halonicjs/studio-kit` reads `theme.css` and checks that:

- every colour has a light and a dark value;
- every text colour passes WCAG AA (4.5:1) and every control edge 3:1 on the surfaces it's used on,
  in both modes, with see-through colours (status chips) blended over each surface they can sit on;
- the radius, spacing, shadow, animation, breakpoint, layer and duration tokens are exactly the
  agreed set, and the shell's layout sizes keep their values, so a change is visible in review;
- the focus rings never remove the outline, so they show in Windows high-contrast mode;
- the kit imports no other Studio package, in any import form.

After tuning a colour, run the tests and adjust until they pass.

## Button

The kit's button: a native `<button>`, `type="button"` unless it submits a form.

```tsx
<Button variant="primary" onClick={createAgent}>
  New agent
</Button>;
<Button variant="ghost" icon={<CloseIcon />} label="Close Support reply" onClick={close} />;
```

| Prop          | What it is                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `variant`     | `primary` once per view, `secondary` (the default), `ghost` for Cancel, `danger` only to confirm |
| `size`        | `sm` 28px, `md` 32px (the default), `lg` 40px, `touch` 48px for a phone's bottom bar or sheet    |
| `block`       | Full width                                                                                       |
| `icon`        | A 16px icon before the label. With `label` and no children, the button is a square icon button   |
| `label`       | An icon button's name, saying what and which: "Close Support reply", never just "Close"          |
| `busy`        | While its request runs: the spinner takes the icon's place, `aria-busy`, clicks ignored          |
| `busyLabel`   | The label while busy ("Creating…"). Both labels share one cell, so the width never changes       |
| `unavailable` | `{ reason }`: the `id` of the visible text that says why the button can't be used now            |
| `type`        | `submit` only for a form's confirming button                                                     |

**There's no `disabled` prop.** A disabled button drops out of the Tab order, so someone on a
keyboard loses their place and never hears why. A button that can't be used takes
`unavailable={{ reason }}` instead: it stays focusable, ignores clicks (and doesn't submit its form),
and screen readers hear the reason through `aria-describedby`. Write the reason next to it, never
only in a tooltip.

```tsx
<Button unavailable={{ reason: "updates-reason" }}>Make a version</Button>;
<p id="updates-reason">Finish getting updates first.</p>;
```

| State       | What shows                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------- |
| Default     | `primary` fill, `secondary` white with a `border-strong` edge, `ghost` no fill, `danger` fill       |
| Hover       | `primary-hover`, `surface-subtle`, `surface-muted` with `fg` text, `danger-hover`; a press the same |
| Focus       | The standard focus ring                                                                             |
| Unavailable | 45% opacity, no hover change, `not-allowed` cursor; its reason is read with it                      |
| Busy        | The spinner in the icon's place (in front of the label when there's no icon); the label stays       |
| Error       | None: a failed action shows a toast or a field error, never a red button                            |

**On a phone and on a touch screen** (`phone:` and `touch:`), `sm` and `md` render at `lg` (40px),
and every size gets a 48px hit area (`hit-touch`), drawn round the button so its look doesn't
change. Icon buttons become 40px squares on a touch screen, beside the 40px text buttons, and
48px squares with a 20px icon on a phone. A `touch` button's label wraps between
words, so at large text it grows taller, never wider than its column.

## Card

A self-contained summary on a page: a routine, a model provider, a stat. Never a card inside a
card.

```tsx
<Card title="Model providers" actions={addButton}>
  …
</Card>;
<Card label="When" actions={onSwitch}>
  Every weekday at 9:00
</Card>;
<Card onClick={openRoutine}>…</Card>;
```

| Prop      | What it is                                                                                   |
| --------- | -------------------------------------------------------------------------------------------- |
| `title`   | The header's title in `text-section`, a heading (`headingLevel`, 3 by default)               |
| `label`   | Instead of a title: a small caption label in capitals, such as the routine's When and Starts |
| `actions` | On the right of the header: `sm` ghost buttons or a switch. Only with a `title` or `label`   |
| `onClick` | The whole card is one `<button>`: no header, nothing clickable, only phrasing content inside |
| `state`   | `disabled` for a Paused or Not connected card, which still says why; `error`                 |

A card with a title or a label is a `<section>` named by it. Write the label in sentence case
("When"): CSS draws the capitals, so a screen reader says the word, not the letters. An empty
title or label counts as none, but never takes the actions with it: they keep their header row,
in an unnamed `<div>`.

Inside an interactive card put only phrasing content: text, `<span>`s and icons, never a `<div>`,
`<p>` or heading, because it all sits inside a `<button>`.

| State    | What shows                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Default  | `surface`, a 1px `border` edge, a 12px radius, no shadow                                                |
| Hover    | Only an interactive card: a `border-strong` edge (an error card keeps its `danger` edge) and `shadow-1` |
| Focus    | Only an interactive card: the standard focus ring                                                       |
| Disabled | Title or label in `fg-disabled` (no header: the whole box), no hover. Still opens, to say why           |
| Error    | A `danger` edge. The card's content says what failed, with a way to open it                             |

**On a phone** cards are rare: lists are flush instead. An interactive card shows the
`surface-subtle` fill while pressed and has no hover.

## EmptyState

A list, page or panel with nothing in it yet, or a search with no results. With `tone="error"`,
the same place when it couldn't load, so a screen never confuses "nothing here" with "something
broke". It's centred in the space it replaces, in a 360px column (`max-w-empty`).

```tsx
<EmptyState
  icon={<AgentIcon />}
  title="No agents yet"
  description="An agent does one job for you, such as sorting your mail."
  action={{ label: "New agent", onClick: newAgent }}
  secondaryAction={{ label: "Start from a template", onClick: pickTemplate }}
/>;
<EmptyState plain title="No results for “sorter”" />;
<EmptyState tone="error" title="Couldn't load agents" description={reason} action={retry} />;
<EmptyState tone="error" align="start" title="Couldn't load recent runs" action={retry} />;
```

| Prop              | What it is                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| `title`           | A heading in `text-section` (`headingLevel`, 2 by default)                        |
| `description`     | One or two sentences that say what the thing is for; for an error, the reason     |
| `icon`            | A 20px icon in `accent` on a 40px tile. Without one there's no tile               |
| `action`          | The one primary button: `{ label, onClick, busy? }`. For an error, Try again      |
| `secondaryAction` | An optional second way in, a secondary button. Not on an error                    |
| `plain`           | No wash and no tile: no search results, and inside small panels                   |
| `tone`            | `error`: the `danger` alert mark in place of the icon, and Try again as secondary |
| `align`           | `start`, only for an error: one section of a page couldn't load                   |
| `titleRef`        | The title, which code focuses when the last row of a list goes (23 A2)            |

The title has `tabindex="-1"` and draws no ring: it's where focus goes when what had it goes away,
not a control. The tile and the alert mark are hidden from screen readers; the title says it all.

`align="start"` is for an error in one section of a page (Home's Recent runs), so the whole page
doesn't look broken: left-aligned in the 16px inset, the alert mark inline with a
`text-body-strong` title, the reason in `text-small`, and Try again as a secondary `lg` button.
Never show it together with a skeleton.

**On a phone** the column fits the page's 328px, and the `md` buttons draw at 40px, as every
`md` button does there. An empty section inside a page is one line of text, not an Empty state.

## StatusChip

The state of an item, in a row, a card header or a panel. It isn't interactive: something you can
click is a Button or a row, never a chip.

```tsx
<StatusChip tone="running" dot>
  Running
</StatusChip>;
<StatusChip tone="outline">Test</StatusChip>;
<StatusChip tone="accent" shape="count" name="3 waiting">
  3
</StatusChip>;
```

| Prop    | What it is                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tone`  | `neutral` (the default), `accent`, `running`, `warning` ("Needs you"), `danger`, `success`, and `outline` for a tag such as Test |
| `dot`   | A still 6px dot before the word, for a live state                                                                                |
| `shape` | `count` for the round counter on a sidebar item or a tab, with tabular figures                                                   |
| `name`  | A count's words, required with `count`: "3 waiting". Screen readers hear them instead of the bare number                         |

Always a word or a number: the colour is never the only sign. Each coloured tone is its colour on
its own `-soft` fill. Every chip carries a 1px see-through edge, which Windows high-contrast mode
draws, and which turns the chip's own colour when the system asks for more contrast. A tag's
edge is always `border-strong`.

There's no hover, focus or disabled state, and the `danger` tone is the error state. On a phone the
chip keeps its size; when it doesn't fit beside a row's title, the row puts it under the title.

## Tabs

A page's own views: Flow / Configuration / Runs. Not the window tabs in the title bar, which
belong to the shell.

```tsx
<Tabs
  label="Workflow views"
  tabs={[
    { id: "flow", label: "Flow" },
    {
      id: "configuration",
      label: "Configuration",
      count: { value: 2, tone: "danger", name: "2 errors" },
    },
    { id: "runs", label: "Runs" },
  ]}
  selected={view}
  onSelect={setView}
>
  {viewContent}
</Tabs>;
```

| Prop       | What it is                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `label`    | The tab list's name: "Workflow views"                                                            |
| `tabs`     | Each tab's `id`, full `label`, optional 16px `icon`, `count` and `disabled`                      |
| `selected` | The selected tab's `id`. The page keeps it, so it remembers its tab while it's on the stack      |
| `onSelect` | Called with the tab's `id` when another tab is picked                                            |
| `fill`     | Equal parts across the column, at least 48px high. On by default on a phone, off on desktop      |
| `sticky`   | The tabs stay at the top of the scroll area, on a `surface` fill, so their counters stay in view |
| `children` | The selected tab's view, inside the one `tabpanel`                                               |

A `count` is `{ value, tone, name }`: an `accent` chip, or `danger` when it counts errors. The
number is hidden from screen readers, which hear its `name` instead: "Configuration, 2 errors".
The tab itself never turns red.

Without `fill`, the labels sit on one line. When the tabs are wider than their column, as at
200% text, each label wraps inside its tab instead of running out of it.

**Keyboard.** Only the selected tab is in the Tab order. The left and right arrow keys move to
the next tab and select it, wrapping round; Home and End jump to the ends. Disabled tabs are
skipped. Switching is instant, with no sliding indicator, and never adds to Back.

| State    | What shows                                                                 |
| -------- | -------------------------------------------------------------------------- |
| Default  | `fg-muted` text on the `surface-muted` track, 28px high                    |
| Selected | A `surface` fill, `fg` text at weight 500, `shadow-1`, a transparent edge  |
| Hover    | Text `fg`, no fill change                                                  |
| Focus    | The standard focus ring                                                    |
| Disabled | `fg-disabled`, clicks ignored, skipped by the arrow keys (`aria-disabled`) |
| Error    | A `danger` counter on the tab whose view has errors                        |

**On a phone** (`fill`, from the presentation context) the track spans the page column and the
tabs share it equally, each at least 48px high with 4px 8px padding. A label wraps between words
and the counter follows it like one more word; a word longer than its tab breaks with a hyphen.
Labels are never shortened and the tabs never scroll sideways. **On a touch screen** at desktop
width a tab renders at 40px with a 48px hit area.

**In high contrast** the selected tab keeps an edge: forced colours drops its fill and shadow and
paints the transparent outline instead. A disabled tab turns `GrayText` (`text-forced-disabled`).

## Presentation

How the Studio is laid out: `desktop` or `phone`. The shell reads the width once, with
`matchMedia` and `PHONE_MAX_WIDTH`, and sets it at its root; without a provider it's `desktop`.

```tsx
<PresentationProvider presentation={isPhone ? "phone" : "desktop"}>
  <App />
</PresentationProvider>;
```

Parts that become a different element or layout on a phone (Select, Dialog, Tabs, Side panel)
read it with `usePresentation()`. A size change is a `phone:` class instead: no kit part reads the
window width. Tests set the provider directly.

`touch:` follows a coarse pointer at any width. A phone with a coarse pointer matches both, and
`phone:` wins: theme.css declares it after `touch:`.

## On a muted fill

A neutral fill on a `surface-muted` fill disappears, so it steps up with `on-muted:`
(`on-muted:bg-border on-muted:text-fg`). The muted fill marks itself: `data-fill="muted"` while it
is muted (an unselected tab, the active menu item), or `data-hover-fill="muted"` when it's muted only on
hover and press (a sidebar row).

## ListHeading

The heading over a group of rows. The List draws it for its own `heading`; it's exported
alone for a list the kit doesn't draw, such as the shell's Settings nav.

```tsx
<ListHeading name="Acme" detail="Workspace settings" />;
<ListHeading name="Acme" detail="Workspace settings" id="settings-acme" layout="stacked" />;
```

| Prop           | What it is                                                                 |
| -------------- | -------------------------------------------------------------------------- |
| `name`         | The group's name, in sentence case: CSS draws the capitals. It may be cut  |
| `detail`       | Says which group: "Workspace settings". Never cut                          |
| `headingLevel` | 2 by default; 3 or 4 where the list sits under a panel's own headings      |
| `id`           | So the list it names can point `aria-labelledby` at it                     |
| `layout`       | `inline` (the default): name · detail. `stacked`: the name over the detail |

`text-caption` in capitals, `tracking-label`, `fg-muted`, padded 16px 16px 4px so its text starts
where the rows' text does. The "·" is hidden from screen readers, which hear a comma instead:
"Acme, Workspace settings". When the detail doesn't fit after the name (at 320px and 200% text),
it moves onto its own line, and a detail too long even for that wraps. Use `stacked` in a narrow
column, such as the 208px Settings nav.

## List

A group of rows: agents, routines, runs, files in a picker. The screen gives the rows as data; the
List draws them.

```tsx
<List
  heading={{ name: "Agents" }}
  rows={agents.map((agent) => ({
    id: agent.id,
    title: agent.name,
    meta: agent.model,
    trailing: <StatusChip tone="running">Running</StatusChip>,
    more: { label: `More actions for ${agent.name}`, onClick: openMenu },
  }))}
  onOpen={openAgent}
/>;
```

| Prop           | What it is                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| `rows`         | The rows, each with a stable `id` (never the index) and the parts below               |
| `heading`      | `{ name, detail }`, drawn above the list with [`ListHeading`](#listheading); names it |
| `headingLevel` | 2 by default                                                                          |
| `label`        | The list's name when it has no heading: "Agents"                                      |
| `onOpen`       | Called with a row's `id` on Enter or a click                                          |
| `selection`    | `{ selected, onToggle, multiple }`: the screen keeps the set, Space toggles a row     |
| `dense`        | 32px rows, for menus and pickers                                                      |
| `flush`        | No outer border or radius, lines from 16px. On by default on a phone                  |

A row has a `title`, an optional `meta` line (cut with an ellipsis), a 20px `icon` (16px in a
32px `dense` row, as in a Menu item) or a 28px `avatar` (both hidden from screen readers), a `trailing` chip or value, a `more` button
(`{ label, onClick }`, its label naming the row), `disabled` and `error` (`{ reason, chip }`).

**Keyboard.** The list is one Tab stop. The up and down arrow keys, Home and End move between
rows; the right arrow key reaches the row's More button and the left one comes back. Enter opens
the row, Space selects it when the list allows selection. When the focused row is removed, focus
goes to the row that took its place, else the one before. It's a `grid`, not a `listbox`, because
rows hold a button.

| State    | What shows                                                                                 |
| -------- | ------------------------------------------------------------------------------------------ |
| Default  | A `surface` fill; 56px with a meta line, 40px without, 32px `dense`; padded 16px           |
| Hover    | `surface-subtle`, and the More button appears                                              |
| Focus    | An inset 2px `accent` ring, which the list's edge can't clip                               |
| Disabled | Title, meta and icon `fg-disabled`, avatar at 45%. Still focusable, but doesn't open       |
| Error    | The reason in `danger` in place of the meta line, and a `danger` chip. It still opens      |
| Selected | `accent-soft`, `aria-selected="true"`. Not "where you are": that's the shell's `halo-tint` |

**On a phone** the list is `flush` and rows are at least 56px (64px with a meta line), padded
12px 16px; `dense` rows are 48px, with a 20px icon. The More button is always there at 48px, and the right edge has
one job: a row with a More button puts its chip under the text. **On a touch screen** at desktop
width the More button is always shown too.

## useGridNavigation

The roving focus behind the List, for a `grid` the kit doesn't draw (the Inbox list). Pass each
row's `id` and which of its cells can take focus; spread `gridProps` on the grid and
`cell(row, column)` on each focusable element.

```tsx
const grid = useGridNavigation(
  rows.map((row) => ({
    id: row.id,
    cells: row.heading ? [] : [true, row.link !== undefined, true],
  })),
);
```

One cell is in the Tab order. ↑ ↓ move between rows in the same column, ← → between a row's
cells, Home and End to the first and last row. Heading rows (no focusable cells) and empty cells
are passed over. Keys from a field inside a cell are left alone.

## SkeletonBar

A still grey bar in the shape of text that is still loading: the List's skeleton rows and the
Side panel's loading lines. No shimmer and no pulse. Hidden from screen readers; the list or
panel says it's loading. A transparent 1px border keeps the bars visible in high contrast, where
the grey fill is dropped.

```tsx
<SkeletonBar kind="avatar" />;
<SkeletonBar kind="title" width="2/5" />;
<SkeletonBar kind="meta" width="7/10" />;
```

| `kind`     | Size                                   |
| ---------- | -------------------------------------- |
| `title`    | 10px high, at `width` of its column    |
| `meta`     | 8px high, at `width` of its column     |
| `trailing` | 10px by 80px, for a value or a chip    |
| `heading`  | 8px by 48px, in a List heading's place |
| `icon`     | 20px square                            |
| `avatar`   | 28px square with an 8px radius         |

`width` is one of a fixed set (`1/3`, `2/5`, `1/2`, `3/5`, `2/3`, `7/10`, `full`), never random,
so tests and screenshots stay the same.

## Kbd

A keyboard shortcut in a menu, the command palette or a tooltip: one box per key.

```tsx
<Kbd keys={["Ctrl", "K"]} />;
```

The shell passes "Ctrl" or "⌘" for the platform. Not interactive, and hidden on a phone, where
there's no keyboard to press it on.

It's hidden from screen readers as well, or a menu item would be named "New tab CtrlT". The control
names the shortcut instead, from the same keys: `keyShortcutsLabel(["Ctrl", "T"])` is
`"Control+T"`, for `aria-keyshortcuts`.

```tsx
<button aria-keyshortcuts={keyShortcutsLabel(keys)}>
  New tab <Kbd keys={keys} />
</button>;
```

## Field

A label, a control and a line under it: the hint, or the error in its place. The Field gives the
control its `id`, `aria-describedby`, `aria-invalid` and `aria-required`, so a screen never wires
them by hand.

```tsx
<Field label="Name" hint="Shown in the sidebar." error={nameError} required>
  <Input value={name} onChange={(event) => setName(event.target.value)} />
</Field>;
```

| Prop        | What it is                                                                  |
| ----------- | --------------------------------------------------------------------------- |
| `label`     | Always there, above the control, in `text-caption` `fg-muted`               |
| `hideLabel` | Hides the label from sight only. Just for a search in a toolbar             |
| `hint`      | A short line under the control in `fg-subtle`                               |
| `error`     | A sentence that says what to do: "Give the agent a name." Replaces the hint |
| `required`  | Writes "Required" after the label in `fg-subtle`. No asterisk               |

Screen readers hear "required" once, from the control's `aria-required`: the visible word is
hidden from them.

The error line is `danger` with the 16px alert icon, so the colour is never the only sign. A
control of your own can read the Field through `useFieldControl()`.

## Input

A one-line text field.

```tsx
<Input aria-label="Search agents" leadingIcon={<SearchIcon />} trailing={clearButton} />;
```

| State     | What shows                                                                              |
| --------- | --------------------------------------------------------------------------------------- |
| Default   | `surface` fill, a `border-control` edge, the placeholder in `fg-subtle`                 |
| Hover     | The edge turns `fg-muted`                                                               |
| Focus     | An `accent` edge and a 3px `accent-soft` ring (`focus-field`), while the text has focus |
| Disabled  | `surface-subtle` fill, a `border` edge, the text in `fg-disabled`, cursor `not-allowed` |
| Error     | A `danger` edge, and a `danger-soft` ring with focus; the sentence comes from the Field |
| Read-only | Like the default on `surface-subtle`, with no hover; the text stays selectable          |

`Input` takes `size` (`md` 32px or `sm` 28px), a 16px `leadingIcon` and a `trailing` button (a
`sm` ghost icon `Button`, such as Clear). A button inside the box keeps the general focus ring, so
you can tell it from the text. A press anywhere in the box, padding and icon included, puts the
caret in the text; a press on the trailing button doesn't.

**Keys.** Enter submits its form, **except while an input method is composing**: the Enter that
picks a Japanese or Chinese word must never send. Your own key handlers use the same check,
`isComposing(event)`, because WebKit ends a composition with an Enter whose `isComposing` is
false.

**On a phone** the box is at least 48px high, with 12px padding and 16px text
(`text-input-touch`), so the browser doesn't zoom in. The trailing button keeps its `sm` look with
a 48px hit area, so the box stays 48px. **On a touch screen** at desktop width the box is 40px,
like the Buttons beside it, and the text is 16px too.

## TextArea

A text field of several lines, in the Input's box and states. It grows with its text up to
`maxRows` lines (5 unless you say otherwise), then scrolls inside.

```tsx
<Field label="Notes">
  <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} maxRows={8} />
</Field>;
```

**Keys.** Enter adds a line. Ctrl Enter (⌘ Enter on macOS) submits its form only with
`submitOnCtrlEnter`, which the forms in component specs 23 A8 turn on: Create version, Start a
run, Ask for changes and a request's message. Otherwise, and outside a form, it goes to your
`onKeyDown`, as other keys do. While an input method is composing, Enter does neither. No key
approves, rejects or deletes.

The limit is `max-h-rows` in `theme.css`: lines in `lh`, after a px fallback from the line-height
token for an engine without that unit.

**On a phone** it's at least 48px high, with 16px text. Long text on a phone page (Instructions,
Description) opens the text sheet instead; that comes with the Sheet.

## CopyButton

A button for a value the user types somewhere else, such as an app name in Google Cloud Console.
It copies the text and says "Copied" in place for two seconds (`COPIED_FOR_MS`).

```tsx
<CopyButton text="Halonic (own app)" label="Copy the app name" />;
```

| Prop    | What it is                                                               |
| ------- | ------------------------------------------------------------------------ |
| `text`  | The text to copy. Plain text only: never a secret (below)                |
| `label` | The name screen readers hear, saying what it copies: "Copy the app name" |

| State        | What shows                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Ready        | The secondary button at the small size (28px; 48px on a phone), saying "Copy"                                                              |
| Copied       | "Copied" in place, with no change in width. Screen readers hear "Copied" through a status region next to the button, which is always there |
| Failed       | The button still says "Copy". A caption next to it says "Couldn't copy. Select the text and copy it yourself."                             |
| Hover, focus | A `surface-subtle` fill on hover; the standard focus ring                                                                                  |

**How it copies.** `navigator.clipboard` first. Without a secure context (a phone on plain http)
it falls back to selecting the text in a hidden text box and running the browser's copy command.

**Never a secret.** A secret field holds its value as a `SecretText`, not a string. `text` takes
only a `string`, so passing a secret is a type error, and the button throws if one gets through a
cast. A `SecretText` turned into text by accident shows `[secret]`; only the request that saves it
calls `reveal()`.

## ExternalLink

A link to a page outside Studio, such as a Google Cloud Console page. Its text says where it goes
("Audience page", never "click here"); the kit adds ↗ after it, and screen readers also hear
"(opens in your browser)".

```tsx
<ExternalLink href="https://console.cloud.google.com/auth/audience">Audience page</ExternalLink>;
```

A left or middle click calls the **`openExternal` service** with the address and cancels the link's
own navigation, so Studio never leaves its page. The address stays on the link, so "Copy link
address" still works. A right click is left to the browser. Only `http` and `https` addresses are
allowed: anything else throws, because addresses are often built from what the user typed.

**An address from a request.** "Sign in with Google" gets its address from the host's start
route, so `href` can be a function that returns a promise. Then `onError` is required, because the
request can fail. The link is a button that looks the same, since there's no address to put on a
link yet. A click asks for the address and passes it to `openExternal` at once, still pending;
further clicks are ignored until it settles (`aria-busy`). An address that isn't `http` or
`https` goes to `onError` too.

```tsx
<ExternalLink href={() => startSignIn(account)} onError={showError}>
  Sign in with Google
</ExternalLink>;
```

**The service.** The shell provides it once, at the root of the app. It gets the address or a
promise of one, and is called inside the click, before anything is awaited. The desktop app waits
for the address and hands it to the system browser:

```tsx
<OpenExternalProvider openExternal={async (address) => desktop.openInSystemBrowser(await address)}>
  <App />
</OpenExternalProvider>;
```

Without a provider, the link uses `openInNewTab`. A known address opens in a new tab with
`noopener` and `noreferrer`. For a pending address the tab has to open inside the click, or the
browser blocks it as a popup: it opens empty at once, its handle back to Studio is cut, and it
gets the address when it arrives. If the request fails, the tab is closed again. Unlike a known
address, that tab is sent Studio's origin as its referrer, because Studio's page navigates it.

The promise `openExternal` returns rejects only when a pending address fails; that goes to
`onError`. For a known address there's nobody to tell, so the shell reports its own errors.

| State   | What shows                                                          |
| ------- | ------------------------------------------------------------------- |
| Default | `accent-text`, like every inline link                               |
| Hover   | Underlined                                                          |
| Focus   | The standard focus ring                                             |
| Phone   | At least 48px high (`min-h-touch`), so the whole line is the target |

## Testing a component

Components are React. Their tests check the rendered markup, ARIA and clicks in jsdom, not
pixels. A component test starts with `// @vitest-environment jsdom` (the token tests read files and
stay in Node) and renders with the helper in `src/test/render.tsx`:

```tsx
// @vitest-environment jsdom
import { click, render } from "../test/render.tsx";

const { container } = render(<Button>Save</Button>);
await click(container.querySelector("button") as HTMLButtonElement);
```
