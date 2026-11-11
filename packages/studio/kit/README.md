# @halonicjs/studio-kit

The Studio's design tokens: every colour, text style, size, radius, shadow and motion value, in one
file (`src/theme.css`), for light and dark mode, and the shared base components, which arrive one
by one. Each component has its own section below, in the order it arrived.

- **Layer:** studio
- **Owner:** noah
- **Public API:** `@halonicjs/studio-kit` (the tokens are CSS, imported from CSS; the components
  are named exports)

## Example

The app's entry CSS sets up Tailwind once and then imports the tokens. Plain CSS `@import` of the
package name resolves to `theme.css` through the `style` export condition. `theme.css` holds the
tokens and imports the rest itself, so the app imports one file: `theme-selection.css` (the
selection, row focus and high-contrast utilities), `theme-utilities.css` (the custom variants and
the other utilities) and `theme-safe-area.css` (the safe areas on a phone).

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
| the halo on a start screen                               | `bg-halo-spot`, `shadow-halo-glow`                |
| a hovered window tab, over the frame                     | `bg-tab-hover`                                    |
| the workflow canvas                                      | `bg-canvas-grid`                                  |
| the focus ring (keyboard focus only)                     | `focus-ring`, `focus-ring-inset` for list rows    |
| a selected row's mark                                    | `selected-bar`, `selected-forced`                 |
| Windows high-contrast mode only                          | `text-forced-disabled`                            |
| `--breakpoint-wide`                                      | `wide:`, `max-wide:` (compact)                    |
| `--duration-*`, `--layer-*` (plain variables)            | `duration-(--duration-base)`, `z-(--layer-toast)` |

## The halo on a start screen

The desktop start screen and Welcome on a computer put one `aria-hidden` element with
`bg-halo-spot` behind their heading and box: the halo tints, fading out from the middle, so text on
it keeps 4.5:1. `shadow-halo-glow` is the app's one glow. Put it on a `rounded-lg` wrapper round
the composer, never on the box itself, whose focus look is a box shadow too. It's a utility, not a
`--shadow-*` token, so it can't turn up elsewhere. A frame colour preset (Settings) sets only
`--halo-blue` and `--halo-violet`; the tints are `color-mix()` of those two, so all six halo
utilities follow. The four presets keep every text colour at 4.5:1 on the spot and the frame.

## Agent pages: the orb, stacked cards and the canvas

`theme-agent-pages.css` holds plain variables, so Tailwind makes no classes from them:

| Variable                             | What it's for                                                              |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `--character-1a` … `--character-5b`  | The agent orb's five colour pairs (halo, lagoon, ember, moss, orchid)      |
| `--stack-peek`, `--stack-inset`      | Each stacked card behind sits 10px higher and 12px narrower on each side   |
| `--stack-shade-1`, `--stack-shade-2` | The fill of the card one behind, and of the cards two or more behind       |
| `--stack-scrim`                      | Over the view under a stack of full cards; lighter than a dialog's overlay |
| `--canvas-grid-dot`                  | The canvas's dots, only through `bg-canvas-grid`                           |

Only the orb reads the character colours: an agent's pair comes from its `character.colors`, or is
picked from its id. They're the same in light and dark and don't follow a frame colour preset. Each
orb edge (`b`) keeps 3:1 on every surface and both stack shades. Each step back in a stack is one
shade darker, and every text colour keeps 4.5:1 on both shades. Text never sits straight on the
canvas's dots: put it on a step card or a `surface-subtle` label plate.

The theme starts from `--*: initial`, so Tailwind's own palette and scales don't exist:
`bg-red-500`, `rounded-3xl`, `text-sm` and `shadow-lg` produce no CSS. Two things still compile and
are not allowed: arbitrary values (`p-[13px]`, `text-[#333]`) and numeric z-index classes
(`z-50`), which Tailwind doesn't take from the theme. Use `z-(--layer-*)` instead.

## Motion, for now

Colour changes and short fades only. Nothing slides, scales or moves on its own, cards don't lift
with motion, and status dots stay still. The one exception is the busy spinner (`animate-spin`).
The curves and durations stay in the file for later.

## More contrast

When macOS or Linux asks for more contrast (`prefers-contrast: more`), colours aren't forced, so
`theme.css` raises its own tokens (component specs 23.5): `fg-muted` and `fg-subtle` darken,
`border`, `border-strong` and the shadows' edge take the 3:1 `border-control`, and the focus ring's
accent grows from 2px to 3px, the inset ring's too. A focused field's soft ring becomes a 1px ring in its edge colour,
and `selected-forced` outlines a selected tab or row in `border-control`. Fills and status colours
don't change. A part adds the rest with `contrast-more:` classes: chips' edges in their own colour,
and 60% instead of 45% for a waiting button. Windows high-contrast mode wins where both apply.

## Checks

`pnpm turbo run test --filter=@halonicjs/studio-kit` reads `theme.css` and checks that:

- every colour has a light and a dark value;
- every text colour passes WCAG AA (4.5:1) and every control edge 3:1 on the surfaces it's used on,
  in both modes, with see-through colours (status chips) blended over each surface they can sit on;
- the radius, spacing, shadow, animation, breakpoint, layer and duration tokens are exactly the
  agreed set, and the shell's layout sizes keep their values, so a change is visible in review;
- the halo utilities are exactly six, hold no hard-coded colour, and keep text at 4.5:1 with each
  of the four frame colour presets;
- `bg-tab-hover` is `surface` at 45% over the frame, and `fg`, `fg-muted` and `accent-text` keep
  4.5:1 on it at both ends of the frame with each preset;
- the agent orb's edges keep 3:1 and text keeps 4.5:1 on the stack shades, and each shade is darker
  than the card in front;
- the focus rings never remove the outline, so they show in Windows high-contrast mode;
- the more-contrast block raises exactly its seven variables, and the raised text colours gain
  contrast on every surface;
- the kit imports no other Studio package, in any import form.

After tuning a colour, run the tests and adjust until they pass.

## ActionBar

The bar an opened page or sheet puts on the bottom edge instead of the bottom navigation: Try it on
the agent page, the decision bar on an Inbox card, a form sheet's confirming button. It's **the
last row of the page's column**, under the scroll area, never `position: fixed`, so nothing hides
behind it and no screen pads its content. A `surface` fill, a `border` line on top, padding 12px
16px and the safe area at the bottom; it grows with its content.

```tsx
<ActionBar
  rows={[
    [{ label: "Approve", variant: "primary", onClick: approve }],
    [
      { label: "Ask for changes", onClick: ask },
      { label: "Reject", onClick: reject },
    ],
  ]}
/>;
```

- Every button is `size="touch"` (48px) and full width. Two in a row share it equally with 8px
  between them, and **stack** in the same order when either label doesn't fit its half (at 320px,
  "Ask for changes" doesn't).
- **At most one `primary` or `danger`, and it comes first.** The bar throws otherwise: it's the
  screen's mistake, not the user's. `danger` is for a decision that deletes or removes something
  (a form sheet's "Delete agent"). Reject is `secondary`, not red: it's a decision, not a removal.
- `note` is a line above the buttons in `text-small`, in its tone (`muted`, `warning`, `danger`),
  never shortened: "Sending is off until you connect Gmail."
- `lead` is an optional row on top, above the note and the buttons, in the same bar: the review
  row while the assistant has changes to review (‹, "The assistant changed 3 things here" with the
  Important chip, ›). The page draws the row, since only it knows the count and where ‹ and › go;
  the bar keeps it inside, so it's one bar, not two.
- While one button is `busy`, the others are unavailable, with the busy one as their reason.
- **When the action can't happen at all, don't render the bar.** A disabled bar looks broken.
- `whileTyping`: `"ride"` (the default) stays on the keyboard, for a bar that confirms what you
  type (a form sheet's button, the decision bar). `"hide"` steps aside while a kit text field in
  the page's scroll area has focus, for a bar about something else (Run now, Try it), so it can't
  cover the field's error. It's one CSS rule: the shell's page column carries the class `page`, its
  scroll area `page-scroll`, and the kit's Input and TextArea carry `data-text-entry`. jsdom can't
  evaluate `:has()`, so the browser check lives with the shell's Playwright tests.

**A wait step's decision bar** (an approval or a choice a workflow asks for, component specs 20.6)
gets its rows from `decisionRows`, given the step's events in file order:

```tsx
<ActionBar rows={decisionRows([approve, askForChanges, reject])} />;
```

The first event is `primary` on its own row. The others are `secondary`: one on its own row, two
side by side, three or more stacked. Nothing is red. Labels are never shortened, and two that share
a row stack when one doesn't fit, as above. The card keeps the rest: it ignores taps for about a
second after it opens, marks the tapped event `busy` ("Approving…") while it decides, and replaces
the bar with the decided callout afterwards.

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

## Dialog

A decision or a short form that must be finished or cancelled. It replaces every native
`prompt`, `confirm` and `alert`. It's a native `<dialog>` opened with `showModal()`, so the focus
trap, the inert page behind it and Escape come from the browser. **Mounting it opens it**; the
screen unmounts it to close it.

```tsx
{
  deleting ? (
    <Dialog
      title="Delete agent?"
      confirm={{ label: "Delete agent", variant: "danger", busyLabel: "Deleting…" }}
      busy={busy}
      error={error}
      onConfirm={remove}
      onCancel={() => setDeleting(false)}
      returnFocus={() => nextRowOrEmptyTitle()}
    >
      Sorter and its history are deleted from this workspace.
    </Dialog>
  ) : null;
}
```

| Prop          | What it is                                                                            |
| ------------- | ------------------------------------------------------------------------------------- |
| `title`       | The dialog's name, in `text-heading`                                                  |
| `size`        | `sm` 440px (the default), `md` 560px for a form with hints, `lg` 720px for Settings   |
| `height`      | A fixed height in px instead of one that follows the content (Settings: 640). Desktop |
| `flush`       | No body padding, for a body that lays out and scrolls its own columns                 |
| `form`        | The body is a form: the confirming button submits it, focus starts in the first field |
| `confirm`     | `{ label, variant?, busyLabel, unavailable? }`: "Delete agent", `primary` or `danger` |
| `onConfirm`   | The confirming button or a submit. Clear `error` first, then check the fields         |
| `cancelLabel` | "Cancel" by default, or what cancelling does: "Not now"                               |
| `onCancel`    | Cancel, the ✕, Escape and the overlay. The screen unmounts the Dialog                 |
| `closeButton` | `false` removes the ✕, for a decision whose cancel button says what it does           |
| `closeLabel`  | The ✕'s name: "Close" and the title by default, without a trailing "?"                |
| `busy`        | The request runs: the confirming button is busy and the rest of the Dialog waits      |
| `error`       | A failed request's message, read through the alert slot at the end of the body        |
| `returnFocus` | Where focus goes on close when the opener has gone or is inert (23 A2)                |

Never wider than the window less 32px nor taller than the window less 64px; the body scrolls and
the header and footer don't. When the window is short (`short:`, under 36em), the header scrolls
with the body and only the footer stays. It fades in over the `overlay` colour with the enter
easing, nothing else moves.

| State      | What happens                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------- |
| Open       | Focus on the first field of a form, or on Cancel in a confirmation                            |
| Cancel     | Escape runs the same `onCancel` as Cancel. The overlay cancels only before anything was typed |
| Incomplete | The confirming button stays pressable; the screen shows every field error, focuses the first  |
| Busy       | The confirming button is busy; Cancel and ✕ are unavailable; Escape and the overlay wait      |
| Error      | `error` shows a `danger` Callout as the last thing in the body. Focus stays on the button     |

**The alert slot.** The body ends in an always-mounted `role="alert"` with no box of its own, so
screen readers know it before the error arrives and it takes no room while empty. On each attempt
it empties, and fills again a frame after the request ends, so a second failure with the same
words is read again. The Callout inside it has no role. **Clear `error` at the start of
`onConfirm`**, or a field error that stops the request leaves the old failure to be read out again.

**The ✕'s name** is "Close" and the title, without a trailing "?": "Delete agent?" gives "Close
Delete agent". A title that starts with "Close" passes `closeLabel`, so "Close Acme?" has a ✕
named "Keep Acme open".

**Focus goes back** to the element that opened the Dialog. When that element has gone (a deleted
row) or is inert, it goes to `returnFocus()`, which runs after the close, so it can name an
element the same change added; else to the page's `h1`. Never to `body`. When nothing had focus
as it opened, there's no opener, so the same fallbacks apply. The page's `h1` needs
`tabIndex={-1}`, or it can't take focus and focus ends on `body` after all.

**Live regions.** While a Dialog is open, everything outside it is inert, so a screen reader can't
hear the shell's own live regions. Each Dialog has a visually hidden `aria-live="polite"` region
and an `aria-live="assertive"` one (no `role="alert"`), and gives both to the shell's announcer
while it's mounted, so `announce()` writes there. The newest Dialog is on top; when it closes,
the one below it takes over again. The shell connects them once, at its root:

```tsx
<ModalRegionsProvider pushModalRegions={(regions) => announcer.pushModalRegions(regions)}>
  <App />
</ModalRegionsProvider>;
```

These regions are separate from the alert slot, which carries only the Dialog's own `error`.

**When the browser closes it anyway** (Chrome lets a second Escape through while busy),
`onCancel` still runs. The request carries on, and its result goes to a toast.

**On a phone** a confirmation stays a dialog, the screen's width less 16px on each side, with no
✕: its buttons are stacked, full width and 48px, the confirming one first in the DOM, so focus
moves in the order you see.

**A `form` Dialog on a phone is a form sheet** (component specs 15.3): the same `<dialog>` and
props, drawn full screen. Close sits at the top left (it cancels and asks nothing) and the title
takes focus. The fields are padded 12px 16px and 16px apart in a body that scrolls. The confirming
button keeps its `confirm.variant` (`primary` or `danger`) and is full width and 48px in an
`ActionBar` at the bottom, riding on the keyboard, and it
submits the one form, so Enter in a field confirms too. There's no Cancel button: Close is
Cancel. While `busy`, Close is unavailable with the busy button as its reason. A failed submit's
Callout is the last thing in the body, above the bar and 16px under the last field. Parts inside can ask `useInFormSheet()`, so a
long field stays a textarea there instead of folding into a text sheet.

## PaletteBox

The Ctrl K palette's box (component specs 24.3): a modal `<dialog>` with no header or footer of its
own. The shell puts its search row, results and footer inside. It's 600px wide (`w-palette`), 96px
from the top, centred, never closer than 16px to the sides, and grows with its content until 96px
above the window's bottom (`palette-frame`). Fill, radius, shadow, overlay and fade are a Dialog's.

```tsx
{
  searching ? (
    <PaletteBox label="Search" initialFocus={() => box.current} onCancel={close}>
      …
    </PaletteBox>
  ) : null;
}
```

It works as a Dialog does: mounting it opens it, the screen unmounts it to close it, Escape
cancels, focus goes back to the opener, and its own live regions take the shell's announcements
while it's open. Focus starts where `initialFocus` says, the search box, since the palette was
opened to type. **One difference:** a click on the overlay cancels even after typing. A Dialog
stops doing that to keep a form's work, but a palette's words are no work to lose.

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
<EmptyState tone="error" title="This page stopped working" action={reload} link={copyDetails} />;
```

| Prop              | What it is                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| `title`           | A heading in `text-section` (`headingLevel`, 2 by default)                        |
| `description`     | One or two sentences that say what the thing is for; for an error, the reason     |
| `icon`            | A 20px icon in `accent` on a 40px tile. Without one there's no tile               |
| `action`          | The one primary button: `{ label, onClick, busy? }`. For an error, Try again      |
| `secondaryAction` | An optional second way in, a secondary button. Not on an error                    |
| `link`            | Only on a centred error: a quieter step after the button, as an inline link       |
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

## Callout

A message that belongs to one place on a page and stays there until what it's about is dealt
with: the key notice, "problems first", a partial undo, a failed save in a dialog. Not a toast
(a toast reports a result and goes), and not the Empty state's error (which replaces content that
didn't load: a Callout sits above content that's there). It has no close button.

```tsx
<Callout tone="info" icon={<ShieldIcon />}>
  This workspace isn't trusted yet.
</Callout>;
<Callout
  tone="warning"
  title="Couldn't change 3 files"
  files={failed}
  action={{ label: "Try again", onClick: retryFailed }}
  announce="focus"
  ref={callout}
>
  Halonic kept a copy of each.
</Callout>;
```

| Prop       | What it is                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------- |
| `tone`     | `info` (also the "neutral" notices), `warning` (nothing was lost), `danger` (wasn't kept)   |
| `title`    | Optional, in `text-body-strong`                                                             |
| `children` | The text, in `text-small` `fg`. Links in it use the normal inline link                      |
| `files`    | File names or paths in mono, which wrap anywhere: three, then "and N more"                  |
| `icon`     | A 16px icon in place of the tone's own, in the tone's colour. The fill never changes        |
| `action`   | One `{ label, onClick }`, a ghost button under the text, busy while a returned promise runs |
| `announce` | `focus` for a Callout that appears because of something you did (below)                     |

The text is `fg`, not the tone's colour: the icon and the fill carry the tone. It wraps and is
never cut, on both sizes. The box has a transparent 1px border, so Windows high contrast, which
drops the fill, still draws it.

**Focus and screen readers.** A Callout that's always there is plain page content: no role, no
focus. One that appears because of something you did, maybe out of sight, takes
`announce="focus"`: it's a `role="group"` named by its title (or its text) and described by its
text and list, with `tabindex="-1"`. The screen scrolls its page to the top, then calls the ref's
`focus()`, which doesn't scroll again. There's no `role="alert"`: a failure that must leave focus
where it is goes through the alert slot that the Dialog and the text sheet own.

**On a phone** it sits inside the 16px page inset, never flush. Its action's `sm` button draws at
`lg` with a 48px hit area, as every `sm` button does there, and stays under the text.

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

A `count` is `{ value, tone, name }`: an `accent` chip, `warning` when it counts what waits for
a person ("1 needs you"), or `danger` when it counts errors. The number is hidden from screen
readers, which hear its `name` instead: "Configuration, 2 errors". The tab itself never turns red.
A tab without a count can show `running: { name: "1 running" }`: a still 6px `running` dot after
the label (never breathing, `CanvasText` in high contrast), read as "Runs, 1 running".

**Tabs apart from their panel.** When the views are picked in a header, away from the view itself
(the item page), use `TabList` and `TabPanel` with the same ids from `useTabIds()`. They draw and
behave as `Tabs` does:

```tsx
const ids = useTabIds();
<header>
  <TabList label="Workflow views" tabs={views} selected={view} onSelect={setView} ids={ids} />
</header>;
<TabPanel ids={ids} tabs={views} selected={view}>
  {viewContent}
</TabPanel>;
```

Without `fill`, the labels sit on one line. When the tabs are wider than their column, as at
200% text, each label wraps inside its tab instead of running out of it.

**Keyboard.** Only the selected tab is in the Tab order. The left and right arrow keys move to
the next tab and select it, wrapping round; Home and End jump to the ends. Disabled tabs are
skipped. Switching is instant, with no sliding indicator, and never adds to Back.

| State    | What shows                                                                 |
| -------- | -------------------------------------------------------------------------- |
| Default  | `fg-muted` text on the `surface-muted` track, 28px high                    |
| Selected | A `surface` fill, `fg` text at weight 500, `shadow-1`                      |
| Hover    | Text `fg`, no fill change                                                  |
| Focus    | The standard focus ring                                                    |
| Disabled | `fg-disabled`, clicks ignored, skipped by the arrow keys (`aria-disabled`) |
| Error    | A `danger` counter on the tab whose view has errors                        |

**On a phone** (`fill`, from the presentation context) the track spans the page column and the
tabs share it equally, each at least 48px high with 4px 8px padding. A label wraps between words
and the counter follows it like one more word; a word longer than its tab breaks with a hyphen.
Labels are never shortened and the tabs never scroll sideways. **On a touch screen** at desktop
width a tab renders at 40px with a 48px hit area.

**In high contrast** the selected tab keeps an outline: forced colours drops its fill and shadow and
keeps a 1px `CanvasText` outline instead (with more contrast, a 1px `border-control` one). A
disabled tab turns `GrayText` (`text-forced-disabled`).

## PickerSheet

The phone's picker (component specs 15.3): a full-screen sheet with **Close** at the top left and
the field's label as its title. It's what the Select becomes on a phone, what the filter chips'
picker opens, and the chat's model chip and the "add" pickers use it too. Mount it to open it and
unmount it to close it; focus starts on the title and goes back to the opener.

```tsx
{
  picking ? (
    <PickerSheet
      title="Model"
      options={[
        { value: "sonnet", label: "Sonnet", description: "€3 per million words in" },
        { value: "opus", label: "Opus", unavailable: { reason: "Needs an Anthropic key." } },
      ]}
      value={model}
      empty="No models yet. Add a provider in Settings."
      onPick={(next) => {
        save(next);
        setPicking(false);
      }}
      onClose={() => setPicking(false)}
    />
  ) : null;
}
```

- The options are **native radios** in one radio group (`appearance: none`), so screen readers
  hear a radio group. A row is padded 8px 16px, 56px with a description, 48px without, with a
  1px line under it (the last row too); the picked option has a 20px `accent` check at the right.
- **A tap, Enter or Space picks**: `onPick` once, and the screen saves (as on desktop) and unmounts
  the sheet. **The arrow keys only move the check.** Browsers fire `click` on the radio an arrow
  moves to, so a click in the same task as an arrow key isn't a pick.
- **Close, Escape and Android back** call `onClose`. Nothing was picked, so the field keeps its
  value.
- An `unavailable` option stays listed, native `disabled` (the one place the kit uses it, 23 A1),
  with its reason as its description. Never hide an option.
- `explanation` is a line at the top ("Only models that Claude Code can use."). From 11 options
  (`PICKER_SEARCH_FROM`) a search field narrows the list by name. With no options, `empty` says
  what's missing and where to add it.

The frame (full screen at `--app-height`, the phone top bar, the Dialog's modal focus, Escape and
live regions) is shared with the text and form sheets.

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
`phone:` wins: theme-utilities.css declares it after `touch:`.

## On a muted fill

A neutral fill on a `surface-muted` fill disappears, so it steps up with `on-muted:`
(`on-muted:bg-border on-muted:text-fg`). The muted fill marks itself: `data-fill="muted"` while it
is muted (an unselected tab, the active menu item), or `data-hover-fill="muted"` when it's muted only on
hover and press (a sidebar row). With more contrast `border` is too dark under `fg`, so the step is
`surface` instead (`contrast-more:on-muted:bg-surface`), set apart by the chip's own edge.

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

## Disclosure

A row that opens more in place: "How the budget works". It's a native `<details>`, so the
browser opens and closes it with a click, Enter and Space, and screen readers hear whether it's
open.

```tsx
<Disclosure summary="How the budget works">Budgets reset on the first of each month.</Disclosure>;
<Disclosure label="What's in it" summary="3 items" tone="value">
  Sorter, Inbox sort and Weekly summary.
</Disclosure>;
```

| Prop          | What it is                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `summary`     | The row's words. They wrap; they're never cut                                                      |
| `tone`        | `label` (the default) in `text-body-strong`, or `value` in `text-body`                             |
| `defaultOpen` | Open when it first renders; after that the user opens and closes it                                |
| `label`       | A caption above the row, for a summary that's only a value                                         |
| `children`    | What opens, in `text-small` `fg-muted` in the 16px inset. Nothing clickable goes in the row itself |

The row is at least 48px, padded 0 16px, with a 20px chevron in `fg-subtle` at the right: down
when closed, up when open, flipped with no animation. Hover is `surface-subtle` and focus is the
inset ring. A `label` is shown above the row and hidden from screen readers, which hear it inside
the row instead: "What's in it, 3 items, collapsed". The Disclosure draws no lines of its own; in
a flush List it takes the List's line like any row. In forced colours the row keeps the text colour,
not the link colour some browsers give a summary.

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

| Prop             | What it is                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `rows`           | The rows, each with a stable `id` (never the index) and the parts below                  |
| `heading`        | `{ name, detail }`, drawn above the list with [`ListHeading`](#listheading); names it    |
| `headingLevel`   | 2 by default                                                                             |
| `label`          | The list's name when it has no heading: "Agents". A list needs one of the two            |
| `onOpen`         | Called with a row's `id` on Enter or a click                                             |
| `onOpenInNewTab` | Called on Ctrl Enter (⌘ Enter), a Ctrl-click (⌘-click) or a middle click                 |
| `selection`      | `{ selected, onToggle, multiple, verb }`: the screen keeps the set, Space toggles a row  |
| `dense`          | 32px rows, for menus and pickers                                                         |
| `flush`          | No outer border or radius, lines from 16px. On by default on a phone                     |
| `empty`          | An [`EmptyState`](#emptystate)'s props, shown in place of the box when there are no rows |
| `loading`        | Skeleton rows in place of the rows; see **Loading** below                                |
| `skeleton`       | `{ leading: "icon" \| "avatar", trailing }`: the shape of the rows that are coming       |
| `loadingLabel`   | What screen readers hear while it loads: "Loading skills". Needed with `loading`         |
| `onRetry`        | Try again, offered once it has loaded for 10 seconds                                     |

A row has a `title`, an optional `meta` line (cut with an ellipsis), a 20px `icon` (16px in a
32px `dense` row, as in a Menu item) or a 28px `avatar` (both hidden from screen readers), a
`trailing` chip or value, a `more` button (`{ label, onClick }`, its label naming the row),
`unavailable` (`{ reason }`) and `error` (`{ reason, chip }`). Unlike the Button's, an unavailable row's `reason` is the text itself: the
List draws it in place of the meta line and points `aria-describedby` at it.

```tsx
<List
  label="Models"
  rows={[{ id: "llama", title: "Llama 3", unavailable: { reason: "Still downloading" } }]}
/>;
```

With `empty`, a list with no rows shows the Empty state in place of its box. The heading stays, so
the page doesn't jump when a row arrives, and the Empty state's title is a level below it.

```tsx
<List
  heading={{ name: "Agents" }}
  rows={[]}
  empty={{ title: "No agents yet", description: "Agents do the work.", action: newAgent }}
/>;
```

**Open and select.** With both `onOpen` and `selection`, every row starts with a checkbox cell
(44px, 48px on a phone or a touch screen), so a mouse or a finger can select without opening. A
click anywhere in the cell selects and puts focus on the box, and the rest of the row opens. The
box is named "Select classifier.ts", or with the selection's `verb`, "Stage classifier.ts", and is
checked while the row is selected. It's a cell of the grid: ← from the main cell reaches it, Space
toggles it, and the main cell stays the first Tab stop. The main cell's ring goes round the whole
row, checkbox cell included; the box has its own ring. An unavailable row's box is still focusable
but does nothing; an error row's box stays selectable.

```tsx
<List label="Changes" rows={files} onOpen={openDiff} selection={{ ...staged, verb: "Stage" }} />;
```

**Keyboard.** The list is one Tab stop. The up and down arrow keys, Home and End move between
rows; the right arrow key reaches the row's More button and the left one comes back. At the ends
they do nothing, and don't scroll the page. Enter opens the row, Space selects it when the list
allows selection. With Ctrl or ⌘ held, Enter and a click call `onOpenInNewTab`, and do nothing
when there isn't one; with Shift or Alt they do nothing. When the focused row is removed, focus
goes to the row that took its place, else the one before. When the last row goes and the list has
`empty`, focus that was in the list moves to the Empty state's title, and focus elsewhere stays
put. It's a `grid`, not a `listbox`, because
rows hold a button.

| State       | What shows                                                                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default     | A `surface` fill; 56px with a meta line, 40px without, 32px `dense`; padded 16px                                                                                                                    |
| Hover       | `surface-subtle`, faded in over 120ms. The More button is always there, in `fg-muted`                                                                                                               |
| Focus       | An inset 2px `accent` ring, which the list's edge can't clip                                                                                                                                        |
| Unavailable | Title and icon `fg-disabled` (`GrayText` in high contrast), avatar at 45%, the reason in `fg-muted`. No hover, a `not-allowed` cursor. Still focusable, but doesn't open                            |
| Error       | The reason in `danger` in place of the meta line, and a `danger` chip. It still opens                                                                                                               |
| Selected    | `accent-soft` and a 2px `accent` bar at the start (8px from a bordered box's corners), and an outline in high contrast; `aria-selected="true"`. Not "where you are": that's the shell's `halo-tint` |

**On a phone** the list is `flush` and rows are at least 56px, padded 12px 16px; `dense` rows are
48px, with a 20px icon. The More button is always there at 48px, and
the right edge has one job: a row with a More button puts its chip at the start of the meta line,
before the text. **On a touch screen** at desktop width the More column is wider (52px) and
rows are at least 48px, a `dense` row's icon 20px again. A `dense` list's More button is 28px, so
the button stays clear of the row's lines; its ring overlaps them and isn't clipped.

**Loading.** While `loading` is set, the List shows the shape of the rows that are coming, so the
page doesn't jump when they arrive. For the first 300ms nothing shows, so a fast load doesn't
flash. Then three still skeleton rows show in the real rows' height (56px, at least 64px on a
phone), with a leading block and a right bar when `skeleton` asks for them, and a 48px bar in the
heading's place; the heading itself stays for screen readers. The rows are hidden from screen
readers: they're `aria-busy`, and a hidden status line next to them says `loadingLabel`, which a
loading List needs. After 10 seconds "Still loading" and Try again show under the rows; the
skeleton stays. A list with `empty` and no rows still shows the skeleton while it loads. When
loading ends with focus on Try again, focus goes to the first row, or to the Empty state's title.
When loading fails, show the [EmptyState](#emptystate)'s `error` tone in place of the List, never a
skeleton and an error together, and the screen focuses its title.

```tsx
<List
  heading={{ name: "Skills" }}
  rows={skills}
  loading={skills === undefined}
  skeleton={{ leading: "icon" }}
  loadingLabel="Loading skills"
  onRetry={reload}
/>;
```

## useGridNavigation

The roving focus behind the List, for a `grid` the kit doesn't draw (the Inbox list). Pass each
row's `id` and which of its cells can take focus (a second argument, `{ startColumn }`, picks the
column that takes focus first, 0 by default); spread `gridProps` on the grid and
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
cells, Home and End to the first and last row. Only ← → (or a click) choose the column: ↓ through a
row without it lands on the nearest cell to its left, and the next row that has it gets it back. Heading rows (no focusable cells) and empty cells
are passed over. Keys from a field inside a cell are left alone. `focusActive()` focuses the cell
in the Tab order, for when the grid takes the place of what had focus.

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
| `avatar`   | 28px and round                         |

`width` is one of a fixed set (`1/3`, `2/5`, `1/2`, `3/5`, `2/3`, `7/10`, `full`), never random,
so tests and screenshots stay the same.

## SidePanel

The frame every side panel shares: step details, the assistant, the list of changes. The shell
decides where panels open and how many, applies `w-panel` (360px), maximise and any resizing; the
panel fills what it's given and never sets its own width.

```tsx
<div className="w-panel">
  <SidePanel
    title="Sort the inbox"
    actions={<PanelButtons />}
    footer={<Button size="sm">Run step</Button>}
    onClose={close}
  >
    <StepDetails step={step} />
  </SidePanel>
</div>;
```

| Prop           | What it is                                                                       |
| -------------- | -------------------------------------------------------------------------------- |
| `title`        | The heading, `text-section`; focus goes here when the panel opens                |
| `label`        | The region's name when the title changes (the Assistant passes "Assistant")      |
| `actions`      | The header's right side, filled by the shell: maximise when allowed, then close  |
| `footer`       | Actions under a divider, right-aligned `sm` buttons                              |
| `loading`      | What screen readers hear ("Loading Sort the inbox"); the body shows still lines  |
| `halo`         | The halo wash at the top of the body. The Assistant only                         |
| `facing`       | The side facing the main view, which gets the 1px line: `start` (default), `end` |
| `initialFocus` | A field to focus instead of the title, for a panel you open to type in           |
| `onClose`      | The phone's Back. On desktop, close is in `actions` and the shell binds Escape   |

| State   | What happens                                                                             |
| ------- | ---------------------------------------------------------------------------------------- |
| Default | 48px header, a body that scrolls on its own (12px 16px), an optional 48px footer         |
| Hover   | Belongs to the header buttons                                                            |
| Focus   | Title on open, or `initialFocus` when it's there; back to the opener on close, else `h1` |
| Error   | The body holds an `EmptyState` with `tone="error"`; the header keeps working             |
| Loading | Still title and meta bar pairs (`SkeletonBar`), `aria-busy`, a status line says why      |

It's a `complementary` region (`<aside>`) named by its title, or by `label`. On desktop it's docked:
a 1px line on the side facing the main view, no radius and no shadow. The header is 48px with the
title on one line (ellipsised; the region's name keeps the full text) and the actions 4px apart; the
footer is 48px too, its `sm` buttons 8px apart. The title takes focus with no ring, as it isn't a
control. It opens and closes without motion; the main view reflows once.

**On a phone** it reads the presentation and becomes a panel sheet: the whole screen, its header
the phone top bar (`--spacing-phone-bar` and the top safe area) with a 48px **Back** at the top
left, the title in `text-heading` on one line, then the actions slot. The footer is a bottom bar
with the bottom safe area. `initialFocus` is ignored there: it would open the keyboard over a
screen you haven't seen yet.

## Checkbox

A choice that is on or off. It's a native checkbox with its own look, so the browser keeps the
keyboard and screen reader behaviour. Give it words, which are part of its target, or a `label`
when it stands without words, as in a List row.

```tsx
<Checkbox checked={scheduled} onChange={setScheduled}>
  Run on a schedule
</Checkbox>;
<Checkbox label="Select Sorter" checked={selected} onChange={toggleSorter} />;
```

| Prop            | What it is                                                                   |
| --------------- | ---------------------------------------------------------------------------- |
| `checked`       | On or off                                                                    |
| `onChange`      | Called with the new value on a click or Space. Not while `unavailable`       |
| `indeterminate` | Some, not all: a dash in place of the check, read as "mixed"                 |
| `unavailable`   | `{ reason }`, the `id` of the visible text that says why. No `disabled` prop |
| `children`      | Its words: "Run on a schedule". Or `label`, its name when it has no words    |
| `tabIndex`      | `-1` only inside a grid, which moves focus with the arrow keys               |

| State         | What shows                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Default       | A 16px box, radius 4px, a `border-control` edge on `surface`                                                |
| Hover         | The edge turns `fg-muted`, over the box or a label round it                                                 |
| Focus         | The standard ring round the box                                                                             |
| Checked       | `primary` fill with an `on-primary` check; mixed shows a dash                                               |
| Unavailable   | 45% (60% for more contrast), an `fg-disabled` edge, `GrayText` in high contrast. Focusable; keeps its value |
| Error         | In a Field with an error: a `danger` edge, `aria-invalid` and the Field's error line                        |
| High contrast | A checked or mixed box fills `Highlight` with a `HighlightText` mark (`checkbox-forced`)                    |

**On a phone or a touch screen** the box stays 16px, and a checkbox with words is at least 48px
high, words included. A box without words takes taps in a 48px square round it (`hit-touch`).

**Unavailable** means clicks and Space change nothing, so a mixed box stays mixed too.

**In a Field** a checkbox with words is named by its words alone: the Field's label stays above it
as a heading, and the box takes the Field's error or hint line. A box without words takes the
Field's label as its name.

## Switch

A setting that is on or off and applies at once. It's a native checkbox with `role="switch"`, so
the browser keeps the keyboard and screen reader behaviour. Give it its sentence, which is part of
its target, or a `label` when it stands without words.

```tsx
<Switch checked={summary} onChange={setSummary}>
  Send a summary every morning
</Switch>;
<Switch label="Turn on Sorter" checked={on} onChange={setOn} />;
```

| Prop          | What it is                                                                   |
| ------------- | ---------------------------------------------------------------------------- |
| `checked`     | On or off                                                                    |
| `onChange`    | Called with the new value on a click or Space. Not while `unavailable`       |
| `unavailable` | `{ reason }`, the `id` of the visible text that says why. No `disabled` prop |
| `children`    | Its sentence: "Send a summary every morning". Or `label`, its name           |

| State         | What shows                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Off           | A 32×18 `surface-muted` track with a `border-control` edge, a 14px `on-primary` thumb at the start |
| On            | A `primary` track, the thumb at the end. It jumps; it doesn't slide                                |
| Hover         | An off track's edge turns `fg-muted`, an on track `primary-hover`, over the switch or its sentence |
| Focus         | The standard ring round the track                                                                  |
| Unavailable   | 45% (60% for more contrast), `GrayText` in high contrast. Focusable; keeps its value               |
| Error         | In a Field with an error: the Field's error line under it, which describes it                      |
| High contrast | A `CanvasText` thumb; an on track fills `Highlight` with a `HighlightText` thumb (`switch-forced`) |

**The row.** The sentence comes first and the switch sits at the end of a row of at most 360px, so
it stays near its words. On a phone the row is the full width, and on a phone or a touch screen
it's at least 48px high, sentence included. A switch without words takes taps in a 48px square
round it (`hit-touch`).

**A failed save** puts the old value back. Outside a modal Dialog the screen says so with a toast;
inside one (Settings), where toasts wait, the Switch sits in a Field and the screen sets the
Field's `error` until the next change, and announces it.

## Slider

A value picked along a range that applies at once: Appearance's panel opacity. It's a native
range input drawn by the kit (`slider`, in `slider.css`), so the browser keeps the keyboard and
screen reader behaviour. Put it in a Field, whose label names it.

```tsx
<Field label="Panel opacity">
  <Slider
    min={10}
    max={100}
    step={5}
    value={opacity}
    onChange={setOpacity}
    onCommit={saveOpacity}
    format={(v) => `${v}%`}
  />
</Field>;
```

| Prop                 | What it is                                                                        |
| -------------------- | --------------------------------------------------------------------------------- |
| `min`, `max`, `step` | The range; `step` is 1 unless given                                               |
| `value`              | Where the thumb is                                                                |
| `onChange`           | Called with every value while it moves. Pass it back as `value`, or it won't move |
| `onCommit`           | Called to save: once when a drag lets go, and on every key step                   |
| `format`             | The value as shown to the right and as its `aria-valuetext`: `(v) => v + "%"`     |
| `unavailable`        | `{ reason }`, the `id` of the visible text that says why. No `disabled` prop      |

| State         | What shows                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Default       | A 6px track: `surface-muted` with a `border-control` edge, `primary` with no edge up to the thumb                         |
| Thumb         | A 16px `primary` circle in a 2px `surface-raised` ring; the value 12px right, tabular, at least 4ch wide                  |
| Hover         | The thumb turns `primary-hover`, also while pressed                                                                       |
| Focus         | The standard focus ring round the thumb, in place of its ring                                                             |
| Unavailable   | 45% (60% for more contrast), `GrayText` in high contrast. Focusable; keeps its value; no hover; drags and keys do nothing |
| Error         | In a Field with an error: the Field's error line under it, which describes it                                             |
| High contrast | A `CanvasText` edge round the track; the filled part and the thumb `Highlight`                                            |

**Saving.** A drag shows each value at once through `onChange` and saves once, when you let go.
The arrow keys, Page Up and Down, Home and End save on every step, because each one is a pick.
A held key is one pick: its repeats move the thumb but wait, and it saves once when let go, or
when focus leaves first. Held at an end, it moves nothing and saves nothing.
Both come from the browser's own `change` event. **A failed save** puts the thumb back: pass the
old `value`. Outside a modal Dialog the screen says so with a toast; inside one (Settings) it sets
the Field's `error`, as for the Switch.

**On a phone** the control is 48px high, so the whole height is the hit area; the track and thumb
stay 6px and 16px, with no grab area round the thumb, so no track shows past its round ends. Keep
it 16px from the screen edges (the page's inset does), out of Android's back-gesture area.

**Browsers.** The desktop webviews are Chromium and WebKit, which have no pseudo-element for the
filled part, so the track paints it as a gradient up to the thumb's centre, from the 0 to 1
`--slider-ratio` the Slider sets.
Served Studio can open in Firefox, which gets `::-moz-range-progress`.

## RadioGroup

One choice out of a few, shown all at once: how agents look things up, the ways to connect. For a
long list, use a Select. A `role="radiogroup"` of native radios, so Tab reaches the group once,
the arrow keys move the choice and Space picks. Put it in a Field: the Field's label names the
group and its hint or error sits under it.

```tsx
<Field label="Connect with" error={connectError}>
  <RadioGroup
    value={way}
    onChange={setWay}
    options={[
      { value: "address", label: "Web address", field: <Input value={address} onChange={…} /> },
      { value: "command", label: "Local command", note: "Runs a program on this computer." },
      { value: "docker", label: "Docker image", note: "Needs Docker.", unavailable: true },
    ]}
  />
</Field>;
```

| Prop       | What it is                                                             |
| ---------- | ---------------------------------------------------------------------- |
| `options`  | `{ value, label, note?, field?, unavailable? }` for each choice        |
| `value`    | The picked option's value, or `null` while none is picked              |
| `onChange` | Called with the value the user picks                                   |
| `label`    | Its name outside a Field. In a Field the Field's label names the group |

An option's **`note`** is a line under its label in `fg-subtle`: what it means, or why it can't be
picked. An **`unavailable`** option needs one. Its **`field`** shows under its label, 24px in, only
while it's picked; the screen keeps what was typed in the others. A radio is named by its label's
words alone and described by its note, so a screen reader reads the note once.

| State         | What shows                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Default       | A 16px circle with a `border-control` edge on `surface`, 2px down to line up with the label's first line |
| Picked        | A 5px `primary` ring round an `on-primary` centre                                                        |
| Hover         | An empty edge turns `fg-muted`, a ring `primary-hover`, over the circle or its label                     |
| Focus         | The standard ring round the circle                                                                       |
| Unavailable   | Circle and words at 45% (60% for more contrast), the note at full strength. Listed; the arrows skip it   |
| Error         | In a Field with an error and nothing picked: a `danger` edge on every circle and the Field's error line  |
| High contrast | A picked circle's ring in `Highlight` (`radio-forced`); an unavailable one `GrayText`                    |

Options are 8px apart, 12px while the picked option shows a field. **On a phone or a touch
screen** every option is at least 48px high, label included, and the options are 0px apart,
because the rows' height gives the space.

**Unavailable is native `disabled` here**, the one exception to 23 A1 in the kit, because the
arrow keys must skip the option. Its reason is always its note, which describes it.

**Saving at once** (Knowledge's lookup mode): the group shows the `value` it's given, so a screen
that puts the old value back after a failed save shows the old choice. The screen says so with a
toast, or with the Field's `error` in a modal Dialog, as for the Switch.

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

## ViewOnlyLine and LineFrame

`ViewOnlyLine` is the one line that says a page can't be changed on a phone: a 16px eye in
`fg-muted`, then the page's own sentence in `text-small` `fg-muted`. Put it first in the page's
content, under the tabs or the top bar, at most once per page, and not again in the sheets the page
opens. The sentence is the screen's and is never shortened; it wraps. It has no action, isn't
dismissible and isn't live: a calm fact, read in order. The rest of the page shows its values as
text, with no greyed-out controls.

```tsx
<ViewOnlyLine>View only on a phone. Edit this workflow on a computer.</ViewOnlyLine>;
```

It's drawn on `LineFrame`, the frame of a plain line at the top of a page: padding 8px 16px, at
least 48px high, a 1px `border` line below, no fill, and a 16px icon top-aligned with the first line
of `text-small` text. A feature's own line (the Changes feature's sharing strip) uses the frame
with its own icon; `muted` puts the icon and the text in `fg-muted`.

```tsx
<LineFrame icon={<ShareIcon />}>Shared with your team.</LineFrame>;
<LineFrame icon={<LinkIcon />} action={{ label: "Turn on", onClick: turnOn }}>
  Sharing is off for this workspace.
</LineFrame>;
```

An `action` (`{ label, onClick }`) is a text button at the right of the line: `accent-text`,
weight 500, no padding, underlined on hover, with a 48px hit area on touch. The text and the action wrap as
one group, so at 200% text the action goes under the text, starting where the text starts. The
line keeps its frame.

## LongText and TextSheet

A long text field: Description, Instructions, an agent step's text. Put it in a `Field` like any
control.

```tsx
<Field label="Instructions" hint="What the agent does." error={instructionsError}>
  <LongText
    value={instructions}
    placeholder="Add instructions"
    onChange={save}
    onSheetDone={(opened) => {
      if (opened !== instructions) {
        toasts.show({
          tone: "info",
          title: "Updated the instructions of Mail triage",
          action: { label: "Undo", onClick: () => save(opened) },
        });
      }
    }}
  />
</Field>;
```

- **On desktop** it's the kit's `TextArea`.
- **On a phone** the text isn't typed in the page (component specs 3). The field is a button
  drawn as the phone Input: the text folded after 8 lines and a 20px chevron. Its name is the
  Field's label and its text is its description. With a Field error the edge is `danger`, so an
  empty required field shows on the page, not only in the sheet. The error is read as part of the
  button's description; the button isn't `aria-invalid`, which a button doesn't support.
- Pressing it opens the **text sheet**. The sheet has the label as its title and **Done** at the
  right, with no Close, because it cancels nothing. Then come the Field's hint, its error, and
  one borderless textarea that fills the screen down to the keyboard. It saves as you type
  through `onChange`. Done and Android back close it and call `onSheetDone` with the text it
  opened with. **The toast with Undo is the screen's:** a phone has no Ctrl Z.
- While the Field has an error, Done and back don't close the sheet: focus moves into the text,
  so the error is read. A failed save (`saveError`) is a danger Callout above the text, and Done
  still closes.
- Inside a form sheet (a `form` Dialog on a phone) a long field stays a real `TextArea`, so a sheet
  of typing never opens over another.

`TextSheet` is exported on its own too, for a screen that opens one without the folded field.

## Menu

A short list of actions that opens from a button: a row's ⋮ More button, the title bar, a sidebar
or window-tab menu. Pass the button as `trigger` and spread the props it gets on it: they name the
menu and let the browser open it. Divide groups with `"divider"`.

```tsx
<Menu
  trigger={(props) => (
    <Button {...props} variant="ghost" icon={<MoreIcon />} label="More actions for Sorter" />
  )}
  entries={[
    { id: "open", label: "Open", keys: ["Ctrl", "O"], onSelect: open },
    { id: "rename", label: "Rename…", onSelect: rename },
    "divider",
    { id: "delete", label: "Delete agent", danger: true, onSelect: remove },
  ]}
/>;
```

| Prop          | What it is                                                                       |
| ------------- | -------------------------------------------------------------------------------- |
| `trigger`     | Renders the button that opens it; a kit `Button` takes every prop it gets        |
| `entries`     | Items and `"divider"`s. An item has `id`, `label` and `onSelect`, and optionally |
|               | `icon`, `keys`, `danger`, `disabled`, `unavailable: { reason }` or `checked`     |
|               | and `attention` (the needs-you dot and its words)                                |
| `description` | Optional: a sentence that explains the menu, shown above the items               |
| `align`       | `start` (the default) lines up with the trigger's left edge, `end` its right     |

| State            | What shows                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Default          | `surface-raised`, radius 12px, `shadow-2`, 4px padding, at least 180px wide; 32px items     |
| Hover and active | The item under the pointer or the keyboard has focus and the `surface-muted` fill; no ring  |
| Danger           | `danger` text, always last, below a divider                                                 |
| Disabled         | `fg-disabled`; still listed, but the arrow keys and type-to-find skip it                    |
| Unavailable      | Label and icon at 45%, its reason underneath at full strength; in the arrow order, no Enter |
| Error            | None: an action that fails reports through a toast                                          |

It's a native `popover`, so it sits on top of everything and closes on an outside click. The kit
places it 4px below the trigger, above it when there's no room, and 8px from the window's edges
(`src/popover/place-popover.ts`; CSS anchor positioning isn't reliable in every webview yet). It
fades in over 120ms. Opened by the keyboard, focus starts on the first item. Opened by the mouse,
focus goes to the menu itself and no item is filled until the pointer is on one; when the pointer
leaves the menu, the fill clears. The arrows, Home, End and typed letters move focus; Enter, Space
or a click picks an item; Escape and Tab close the menu. Focus goes back to the
trigger before `onSelect` runs, so a Dialog the item opens returns focus there.

A shortcut shows as a Kbd and is named with `aria-keyshortcuts`. An `unavailable` item's reason is
the item's description.

An item with `checked` is one choice of several, a `menuitemradio` with `aria-checked`: `true` on
the current one, which shows a 16px `accent` check at the right, `false` on the others. The filter
chips' picker uses it on desktop, where a phone opens the picker sheet.

An item with `attention` waits for someone, as a window tab can: it shows the still 6px `warning`
dot at the right, kept in forced colours, and its words follow the label in the item's name,
"Support reply, needs you". The narrow window's list of open tabs uses it.

A `description` is a sentence that explains the menu, such as the sample chip's "Runs on the
built-in test model, with scripted replies. No key, no cost." It's the first row, in `text-small`
`fg-muted`, padded 8px 8px 6px, at most 300px wide and wrapping, with a divider under it. It isn't
an item: it has no role and can't take focus, so the arrows and type-to-find pass it by. The menu's
`aria-describedby` points at it, so a screen reader reads it once when the menu opens. It never
holds a link or a button: anything you can click is an item below it.

**On a phone and under a coarse pointer** items are 48px with a 20px icon, and an unavailable
item has 12px of padding above and below. On a phone shortcuts are
hidden. It stays a popover menu, not a sheet.

### ContextMenu

The same menu for a right-click, Shift F10 or the Menu key on something that isn't a button, such
as a window tab. The screen listens for those and sets `target`; the menu is open while it's set
and calls `onClose` when it closes by itself (Escape, Tab, a pick or an outside click). Its
`label` names it, such as the tab's title.

```tsx
const [target, setTarget] = useState<ContextMenuTarget>();

<div
  role="tab"
  onContextMenu={(event) => {
    event.preventDefault();
    setTarget({ element: event.currentTarget, at: { x: event.clientX, y: event.clientY } });
  }}
/>;
<ContextMenu
  label="Support reply"
  entries={entries}
  target={target}
  onClose={() => setTarget(undefined)}
/>;
```

With a point (`at`, a right-click) the menu opens there and the focus goes to the menu itself, as
when the mouse opens a Menu. Without one (Shift F10, the Menu key) it opens 4px below the element
and the focus goes to its first usable item. Escape and Tab give the focus back to the element; a
pick gives it back before `onSelect` runs, so an item that removes the element (Close) can move the
focus on. A right-click on the open menu doesn't open the browser's own menu over it.

Setting `target` back to `undefined` closes the menu without calling `onClose`, which is for the
menu's own closing. Placement is the Menu's: the menu stays 8px inside the window's edges and
opens above when there's no room below. A menu opened from the keyboard follows its element when
the window resizes or something scrolls; one opened at a point stays where the click was.

## HeaderBadge

The badge in the title bar's header slot, at its right end before Saved and the Assistant button:
the **sample chip** or the **trust badge**. It's a real button drawn as the neutral Status chip, so
it reads as a state but can be clicked. The slot holds one at a time; the trust badge wins.

```tsx
<HeaderBadge
  as="menu"
  description="Runs on the built-in test model, with scripted replies. No key, no cost."
  entries={[
    { id: "real", label: "Use a real model…", onSelect: useRealModel },
    { id: "remove", label: "Remove the sample", onSelect: removeSample },
  ]}
  onOpenSheet={openSampleSheet}
>
  Sample · test model
</HeaderBadge>;

<HeaderBadge as="button" action="Review" onClick={openTrustCheck}>
  Not trusted yet
</HeaderBadge>;
```

| Prop          | What it is                                                                         |
| ------------- | ---------------------------------------------------------------------------------- |
| `as`          | `menu`: opens a Menu. `button`: does one thing, such as opening the trust check    |
| `children`    | The words: "Sample · test model", "Not trusted yet"                                |
| `description` | `menu` only: the Menu's description line                                           |
| `entries`     | `menu` only: the Menu's items                                                      |
| `onOpenSheet` | `menu` only: on a phone, opens the panel sheet with the same line and items        |
| `action`      | `button` only: where it leads, after a middle dot in `accent-text`: "Review"       |
| `label`       | `button` only: its name, when it isn't "words. action" ("Not trusted yet. Review") |
| `onClick`     | `button` only                                                                      |

| State            | What shows                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Default          | 24px high, radius 4px, `surface-muted`, `text-caption` 500 in `fg-muted`, 14px icon, 6px gap |
| Hover            | Fill `border`, text `fg`                                                                     |
| Focus            | The standard focus ring                                                                      |
| Open (menu only) | A 2px `accent` ring while its Menu is open; not the focus ring, which is in the Menu         |
| Disabled, error  | None: a badge that can't do anything isn't shown                                             |

It's **always neutral**, never `warning`, even for "Not trusted yet". The sample chip has the info
icon and a trailing chevron, `aria-haspopup="menu"` and `aria-expanded`, and opens its Menu lined
up with its right edge, 4px below. The trust badge has a dashed ring ("not decided yet") and no
chevron or `aria-haspopup`: it opens the trust check, not a menu. The whole badge is the target.
With more contrast its edge is `border-control`; in high contrast the see-through edge shows.

`headerBadgeMenuClasses` is the sample chip's look for another Menu trigger that is drawn as a
header badge, with its own words and chevron: the shell's "3 open tabs ▾" in a narrow window.

**On a phone** it sits on its own 48px line, which the shell puts under the workspace row in More,
with a 48px hit area; at large text it wraps instead of being cut. There the trust badge opens
Settings › Trust, so the feature passes `label="Not trusted yet. Open trust settings"`. The sample
chip calls `onOpenSheet` instead of opening a Menu: the panel sheet is a page on the shell's stack,
so the shell opens it.

The shell fills that page with **`HeaderBadgeSheet`**, given the badge's words as its `title`, the
same `description` and `entries`, and `onClose` for Back:

```tsx
<HeaderBadgeSheet
  title="Sample · test model"
  description="Runs on the built-in test model, with scripted replies. No key, no cost."
  entries={sampleEntries}
  onClose={back}
/>;
```

It's a `SidePanel` panel sheet. The description is its first body line, in the Menu's type; the
items follow as 48px link rows, edge to edge, a `border` line under each and a chevron at the right,
danger items last. Dividers fall away. A tap calls the item's `onSelect`; a disabled or unavailable
item stays listed and does nothing, an unavailable one with its reason under its label.

## Tooltip

A short label for a control: an icon button's name, a disabled control's reason, a shortcut.
Spread the props `children` gets on the control: they link it to the tooltip.

```tsx
<Tooltip text="New tab" keys={["Ctrl", "T"]} isName>
  {(props) => <Button {...props} variant="ghost" icon={<PlusIcon />} label="New tab" />}
</Tooltip>;
```

| Prop       | What it is                                                                       |
| ---------- | -------------------------------------------------------------------------------- |
| `text`     | A few words. Never anything you click                                            |
| `keys`     | The control's shortcut, shown after the words and set as its `aria-keyshortcuts` |
| `isName`   | The text is the control's name, as on an icon button: it doesn't describe it too |
| `children` | Renders the control; a kit `Button` takes every prop it gets                     |

| State    | What shows                                                                                 |
| -------- | ------------------------------------------------------------------------------------------ |
| Hidden   | Nothing                                                                                    |
| Shown    | `fg` fill, `surface` text (so it inverts in dark mode), `text-caption`, radius 4px, ≤240px |
| Shortcut | The keys 8px after the words, `font-mono`, 6px apart, without the Kbd's box                |

It shows after 500ms of hover or at once on keyboard focus, and hides on leave, blur or Escape;
that Escape goes no further, so a Dialog round it stays open. A press hides it too, and it doesn't
show again until the pointer has left the control and come back. It's a `popover="manual"`,
centred under the control by the same helper as the Menu, never native `title`.

The control is described by the tooltip (`aria-describedby`), after an unavailable reason. When
the tooltip only repeats the control's name, as on an icon button, set `isName`: the Tooltip can't
tell by itself, and a screen reader would otherwise read the name twice. The shortcut stays.

The control is wrapped in an `inline-flex` span, which gets the pointer and focus events. Where a
Button has to stretch as a flex or grid child, give it a Tooltip only if the span may stay its
size; icon buttons are fine.

**On touch** it never shows, not even on a long press, so what it says must be reachable another
way: the icon button's name, a hint under a disabled control. Focus from an external keyboard still
shows it.

## FilterChips

A row of chips that filters a list (component specs 15.7), on both sizes. It wraps onto a second
line and never scrolls sideways: when a row gets too full, the answer is a picker chip, not a
scrolling row.

```tsx
// One-of, a radio group: the hub filter, when it's the page's only filter.
<FilterChips
  label="Hub"
  options={[
    { value: "all", label: "All" },
    { value: "acme", label: "acme" },
  ]}
  value={hub}
  onChange={setHub}
/>;

// On/off, toggle buttons with aria-pressed: Runs' Test runs.
<FilterChips
  label="Filters"
  toggles={[{ label: "Test runs", pressed: testRuns, onChange: setTestRuns }]}
/>;
```

- Off is a `surface` pill with a `border-control` edge and `fg-muted` text. On is `accent-soft`
  with `accent-text` at 500 and a **12px check** before the label, so on and off differ in shape
  too (23 A11).
- 28px on desktop; 32px with a 48px hit area on a phone or a touch screen. 16px between wrapped
  lines keeps two lines' hit areas apart.
- One-of chips are native radios that share a name: one Tab stop, the arrow keys move the choice.
  The row shows the `value` it's given, so a screen that puts the old filter back shows it.
- An `unavailable` toggle stays focusable, keeps its state in `fg-disabled`, ignores presses and
  points at the `id` of the visible hint that says why.
- With one hub, the feature hides the hub filter; the kit doesn't decide that.

- A **picker chip** ("Hub: All hubs ⌄") goes in a row with other filters, on both sizes: Runs, and
  Search's In and Hub. Picker chips come before the on/off chips. With nothing picked it's the off
  chip with the `all` words; with a value picked, the on chip with that value and no check, since
  the changed word shows the state. Long values end in an ellipsis at 160px.
- It's a button named by its label and its words ("Hub: acme"). On desktop it opens a Menu of radio
  items, on a phone the picker sheet titled with the label, the same switch the Select makes. The
  `all` option comes first; a pick calls `onChange` with the value, or `undefined` for all, and
  focus goes back to the chip. Closing the sheet keeps the value.

```tsx
<FilterChips
  label="Filters"
  pickers={[{ label: "Hub", all: "All hubs", options: hubs, value: hub, onChange: setHub }]}
  toggles={[{ label: "Test runs", pressed: testRuns, onChange: setTestRuns }]}
/>;
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
| `prefix`    | `{ symbol, name }`: a currency outside the box, such as "€", "in euros"     |

Screen readers hear "required" once, from the control's `aria-required`: the visible word is
hidden from them.

The error line is `danger` with the 16px alert icon, so the colour is never the only sign. A
control of your own can read the Field through `useFieldControl()`.

A `prefix` puts its symbol in `text-body` `fg-muted` 8px before the box, centred on it, and
tapping it focuses the control. Screen readers skip the symbol and hear its `name` after the
label: "Per run, in euros". The hint and the error still start at the Field's left edge, under
the symbol. Pass both parts: the symbol from `Intl.NumberFormat(…).formatToParts`, the name from
the message catalogue. The Field never guesses the name, because the currency can change.

```tsx
<Field label="Per run" prefix={{ symbol: "€", name: "in euros" }}>
  <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
</Field>;
```

## FormRows

Side-label rows for a wide item page (a Skill or a Connector): the label in a 168px column on the
left, the value 16px after it, a 1px `border` line between rows. Every Field inside `FormRows`
takes `layout="side"` from it, so a screen never writes the prop.

```tsx
<FormRows>
  <Field label="Name" hint="Shown in the sidebar." error={nameError} required>
    <Input value={name} onChange={(event) => setName(event.target.value)} />
  </Field>
  <Field label="Instructions" wide>
    <TextArea value={instructions} onChange={(event) => setInstructions(event.target.value)} />
  </Field>
  <Field label="Used by" align="text">
    <p>Support bot, Inbox triage</p>
  </Field>
</FormRows>;
```

| Prop                | What it is                                                                   |
| ------------------- | ---------------------------------------------------------------------------- |
| `inCard` (FormRows) | A routine card's rows: a 120px label column, 12px gaps and no lines          |
| `layout` (Field)    | `"side"` for one side-label Field outside FormRows; `"stack"` to opt one out |
| `align` (Field)     | `"text"` when the value is text, not a control: the label isn't moved down   |
| `wide` (Field)      | Drops the value column's 560px limit, for long text such as Instructions     |

The label is `text-small`, weight 500, `fg-muted`, 6px down so it sits on a 32px control's text
line. The hint or error sits under the value, not under the label, and an error never colours the
label or the row. A Switch or a RadioGroup goes in the value column; the label is the setting's or
the group's name.

**When it falls back:** each Field is its own container query. Side by side only while the row is
at least 46.5rem wide (28rem in a card); narrower, and always on a phone, every Field is label over
value, as above. The limit is in `rem`, so larger text falls back too. Nothing reads the window
width.

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
picks a Japanese or Chinese word must never send. `Input` and `TextArea` don't pass a composing
Enter to your `onKeyDown`; a key handler on any other element uses the same check,
`isComposing(event)`, because WebKit ends a composition with an Enter whose `isComposing` is false.

**On a phone** the box is at least 48px high, with 12px padding and 16px text
(`text-input-touch`), so the browser doesn't zoom in. The trailing button keeps its `sm` look with
a 48px hit area, so the box stays 48px. **On a touch screen** at desktop width the box is 40px,
like the Buttons beside it, and the text is 16px too.

**The leading button.** Instead of a `leadingIcon`, the box can start with a small button: the
colour field's swatch, which opens its popover. The type takes one or the other, never both.

```tsx
<Field label="First colour" error={hexError}>
  <Input
    value={hex}
    onChange={(event) => setHex(event.target.value)}
    leadingButton={{
      label: `Choose the first colour, now ${lastGood}`,
      onClick: openPopover,
      expanded: popoverOpen,
      controls: "first-colour-popover",
      children: <Swatch colour={lastGood} />,
    }}
  />
</Field>;
```

| `leadingButton` | What it is                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `label`         | Its name, with the feature's verb and the value read with it                                   |
| `onClick`       | Called on a click, Enter or Space. The text doesn't take focus                                 |
| `children`      | The glyph, 16px at most, drawn by the feature; hidden from screen readers                      |
| `expanded`      | Whether what it opens is open; adds `aria-haspopup="dialog"`. Leave it out if it opens nothing |
| `controls`      | The `id` of what it opens, set as `aria-controls` while it's open                              |

The kit draws the slot, the hit area and the focus; the feature draws what's inside. The hit area
is 24px square, 4px from the box's left edge, and the text starts 8px after it (36px in). On a
phone it's the 48px square at the left of the box, over its edge, and the text starts at 56px. The button has the
general focus ring, and the box's `accent` edge shows only while the text has focus, so you can
always tell which of the two you're on. It has no fill of its own: a hover is the box's. While the
Input is disabled or read-only, the button is disabled too, its glyph at 45%.

## ColourPopover

What a colour field's swatch button opens: preset swatches as a radio group and a hex Input
under them. There's no hidden `<input type="color">`: whether WebKitGTK opens one from the
keyboard depends on its version. The screen owns `open` and the colour; the words are its own.

```tsx
<ColourPopover
  id="first-colour"
  open={open}
  opener={swatchButton}
  onClose={() => setOpen(false)}
  label="Choose the first colour"
  presets={[{ value: "#3B8BFF", name: "Blue" }, …]}
  value={first}
  onChange={setFirst}
  presetsLabel="Presets"
  hexLabel="Hex colour"
  hexError="Use six digits, like #3B8BFF."
/>;
```

| Prop                                   | What it is                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `id`                                   | For the opener's `aria-controls`                                                                   |
| `open`, `onClose`                      | Shown while `open`. `onClose` on Escape, a press outside or focus leaving it                       |
| `opener`                               | A ref to the button that opens it; it lines up with the box the button is in                       |
| `label`                                | Its name, in the feature's verb                                                                    |
| `presets`                              | `{ value, name }` for each colour, four to a row                                                   |
| `value`, `onChange`                    | The last good colour; `onChange` with a pick or a typed six-digit hex                              |
| `presetsLabel`, `hexLabel`, `hexError` | The heading over the presets, the hex field's label, and what it says when the text isn't a colour |

| State         | What shows                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Open          | 4px under the field's box, 244px, `surface-raised`, radius 12px, `shadow-2`, padding 12px       |
| Swatch        | 24px, its colour, a 1px `border-control` edge; `fg-muted` edge on hover                         |
| Picked        | A 2px `accent` ring with a 2px gap and a 14px check: white on a dark colour, ink on a light one |
| Focus         | The standard ring with a `surface-raised` gap; the arrows move the pick, as in a radio group    |
| Typed hex     | Applies as soon as it's six digits; a colour that isn't a preset leaves none picked             |
| Hex error     | Nothing changes; leaving the field or Enter shows `hexError` under it                           |
| More contrast | The popover's edge turns `border-control`                                                       |
| High contrast | Swatches keep their colour and a `CanvasText` edge; the pick and focus are `Highlight`          |

**Focus.** It opens with focus on the picked preset, or the first. Escape closes it and gives
focus back to the button. A press outside closes it; a press on its button doesn't, so the
button's own click opens or closes it (a `manual` popover: the browser's light dismiss would
close it on the press and the click would open it again). Tab past the hex field closes it too,
and so does Shift+Tab back onto the button. On a focused, picked swatch the focus ring takes the
place of the pick's ring, and the check still shows the pick.

Two presets may name the same colour; both are picked when it's the current one.

**On a phone** it's still a popover, like the Menu, the screen's width less 8px each side, and
each swatch is a 48px target round its 24px square.

`parseHex(text)` reads six hex digits, with or without `#`, and gives `#RRGGBB` or `null`, so
the screen checks a saved colour the same way.

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

The limit is `max-h-rows` in `theme-utilities.css`: lines in `lh`, after a px fallback from the
line-height token for an engine without that unit.

**On a phone** it's at least 48px high, with 16px text. Long text on a phone page (Instructions,
Description) opens the text sheet instead; that comes with the Sheet.

## Select

Pick one value from a list: a model, a hub. On desktop it's the native `<select>`, so the keyboard
and screen readers work as they do everywhere, in the Input's box with a chevron at the end.
Options use the system's list. Put it in a Field, which names it and puts its hint or error under
it.

```tsx
<Field label="Model" error={modelError}>
  <Select options={models} value={model} onChange={setModel} placeholder="Choose a model" />
</Field>;
```

| Prop          | What it is                                                                     |
| ------------- | ------------------------------------------------------------------------------ |
| `options`     | `{ value, label, disabled?, reason? }` in list order. A `disabled` one is grey |
| `value`       | The picked value                                                               |
| `onChange`    | Called with the new value as soon as the user picks it                         |
| `placeholder` | Shown while `value` isn't in `options`: "Choose a model". It can't be picked   |
| `size`        | `md` 32px (the default) or `sm` 28px. 48px on a phone, 40px on a touch screen  |
| `emptyText`   | The phone's picker sheet with no options: what's missing and where to add it   |
| `ref`         | The control you focus: the `<select>`, or the picker button on a phone         |

| State    | What shows                                                                               |
| -------- | ---------------------------------------------------------------------------------------- |
| Default  | The Input's box, the value in `fg`, a 16px `fg-muted` chevron with 32px of room          |
| Hover    | The edge turns `fg-muted`                                                                |
| Focus    | An `accent` edge and a 3px `accent-soft` ring (`focus-field`)                            |
| Disabled | `surface-subtle` fill, a `border` edge, the value in `fg-disabled`, cursor `not-allowed` |
| Error    | A `danger` edge; typically the placeholder in `fg-subtle`, for a value that's gone       |

There's no read-only Select: a native select has none, and a view-only page shows the value as
text. A list with icons, descriptions or search is a different component, not a Select.

**On a phone** (the `phone` presentation) the Select is a **picker button** instead, never the
browser's menu: 48px high with 16px text and a 20px chevron, like the phone Input and the folded
LongText. It's named by the
Field's label and then the value, so a screen reader hears "Model, Sonnet", and the label points at
it. It's the only control rendered; with a `name`, a hidden input carries the value for a form that
posts, except while the Select is unavailable, as a disabled select isn't posted. The button opens the **PickerSheet** titled with the label (`aria-haspopup="dialog"`). A pick
is saved at once and closes it, Close keeps the value, and either way focus goes back to the button.
A `disabled` option is listed and can't be picked, with its `reason` under it ("Only models
Claude Code can use"); the desktop's native list has no room for a reason. With no options, the
sheet shows `emptyText` instead: "No models yet. Add a provider in Settings." A Field error shows
as the `danger` edge and reaches screen readers through the button's description, since a button can't be `aria-invalid`.

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
| Failed       | The button still says "Copy". A caption under the row says "Couldn't copy. Select the text and copy it yourself."                          |
| Hover, focus | A `surface-subtle` fill on hover; the standard focus ring                                                                                  |

**Where it goes.** Beside what it copies, in a wrapping flex row. The button and its caption have
no box of their own, so they join that row: the caption goes on the line under the whole row, at
its full width, and stays one or two lines on a phone.

```tsx
<div className="flex flex-wrap items-start gap-x-2 gap-y-1">
  <code>studio serve --port 4310</code>
  <CopyButton text="studio serve --port 4310" label="Copy the command" />
</div>;
```

**How it copies.** `navigator.clipboard` first. Without a secure context (a phone on plain http)
it falls back to selecting the text in a hidden text box and running the browser's copy command.

**Never a secret.** A secret field holds its value as a `SecretText`, not a string. `text` takes
only a `string`, so passing a secret is a type error, and the button throws if one gets through a
cast. A `SecretText` turned into text by accident shows `[secret]`; only the request that saves it
calls `reveal()`.

## ClipboardProvider and ToastStoreProvider

Two services the shell sets at its root, so a kit part can copy and confirm without the screen
passing anything. The CommandBox uses both.

```tsx
<ClipboardProvider writeClipboard={(text) => desktop.writeClipboard(text)}>
  <ToastStoreProvider store={toasts}>
    <App />
    <ToastRegion store={toasts} />
  </ToastStoreProvider>
</ClipboardProvider>;
```

| Provider             | What it gives                                                        |
| -------------------- | -------------------------------------------------------------------- |
| `ClipboardProvider`  | How to copy: Tauri's clipboard. Resolves `true` or `false`, no throw |
| `ToastStoreProvider` | The window's toast store, the one its `ToastRegion` shows            |

Without a `ClipboardProvider`, parts copy with `navigator.clipboard`, which needs a secure
context, and fall back to the browser's copy command for a phone that reaches the computer over
plain http. Without a `ToastStoreProvider`, a part has no toasts and says what happened itself.

A part outside the kit that copies or toasts the same way reads them with `useWriteClipboard()`
and `useToastStore()` (which is `null` without a provider), such as the shell's Copy details.

A Dialog also gives the parts inside it its own polite region, because toasts wait while a
dialog is open: a part says "Copied" there instead.

## CommandBox

A command to copy and run on your computer: Trust's `halonic trust …`, the serve key block.

```tsx
<CommandBox command="halonic trust ~/work/acme" />;
```

The command is `font-mono` `text-small` on `surface-muted`, radius 4px, padding 6px 8px. A long
path wraps anywhere and never scrolls sideways, and one click selects the whole command. The
ghost icon button next to it is named "Copy command" and keeps that name after copying; on a
phone it's 48px.

It confirms with a "Copied" toast. If copying fails, the command is left selected and the toast
says "Couldn't copy. Select the command and copy it." Inside a Dialog, where toasts wait until it
closes, it says the same through the Dialog's polite region instead, shows a check in place of its
icon until the button loses focus, and shows a failure under the box. The screen passes nothing
for any of this: it copies through the `ClipboardProvider` and toasts through the
`ToastStoreProvider` (above). With neither a toast store nor a Dialog round it, it says the
outcome in a status line of its own.

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

## WindowBar and Window

The thin header bar of a file view, shared with the `window` on halonic.dev so the site and the
Studio look like one product (theme proposal, HAL-1687). It shows the file name or the run in small
mono text, with optional `sm` ghost buttons on the right. There are no window dots.

```tsx
<WindowBar title="workflows/review.yaml" actions={copyPath} />;
```

At the top of a pane, use `WindowBar` on its own: the pane already has its border lines. For a
file or a run's steps inside a page, `Window` puts the same bar in a bordered `surface` frame with
a 12px radius, named by its title. It adds no padding, so its content sets its own.

```tsx
<Window title="workflows/review.yaml">
  <pre tabIndex={0} className="overflow-x-auto p-4 font-mono text-code focus-ring-inset">
    …
  </pre>
</Window>;
```

The window clips its content to its rounded corners, so content wider than the window scrolls
itself: give it `overflow-x-auto`, and `tabIndex={0}` so a keyboard user can focus it and scroll
with the arrow keys. Biome flags `tabIndex` on a `<pre>` (`noNoninteractiveTabindex`), so add a
`biome-ignore` with that reason, as the states page does. Its focus ring is `focus-ring-inset`,
which stays inside the clip. The bar isn't clipped, so the focus ring of an action in it shows in
full, also in high-contrast mode.

Each `Window` is a region landmark named by its title (with an empty title it's unnamed), so
screen-reader users can jump to it. Use one or a few per page.

The site's code windows are always dark; the Studio's follow light and dark mode, like the rest of
the app. A long title wraps instead of being cut off, so the bar grows a line in a narrow pane.

## IconTile

One of our 20px line icons on a 40px halo tile, the same tile halonic.dev puts next to a feature
or a product. It's decoration, hidden from screen readers: the words next to it say the same.

```tsx
<IconTile>
  <FileIcon />
</IconTile>;
```

The Empty state keeps its own tile, a `surface` one with a shadow, because it sits on the halo
wash, where a halo-tinted tile would disappear.

## PlaceIcon

The icon of a sidebar place, named by the place's key: `home`, `inbox`, `agents`, `workflows`,
`routines`, `library`, `runs` and `changes`. The outline shows by default; `filled` draws the place
where you are. A filled icon keeps the outline's shape and cuts its inner details out (the inbox's
tray, the clock's hands), so it reads on the halo tint and in forced colours. It draws in the text
colour and fills its box, so the caller sizes and colours it. It's hidden from screen readers,
because the place's name says the same.

```tsx
<span className="size-icon-md text-accent">
  <PlaceIcon name="inbox" filled />
</span>;
```

## Toast and ToastRegion

The result of something you did or something that finished in the background: "Agent saved",
"Run failed". A toast reports and goes; a message that stays in its place is a Callout. The kit
has a plain store with no knowledge of the shell, which wraps it as its `toasts` service, and the
region that shows it. The shell places the region once, in a `position: relative` wrapper round
its content area (on a phone, round the scroll area), so toasts never cover the status bar or the
bar at the bottom.

```tsx
const toasts = createToastStore();
toasts.show({ tone: "success", title: "Agent saved" });
toasts.show({
  tone: "info",
  title: "Run moved to Archive",
  action: { label: "Undo", onClick: undo },
});
<ToastRegion store={toasts} />;
```

| Store method          | What it does                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `show(message)`       | Adds `{ tone, title, text?, action? }` at the bottom; returns its id |
| `close(id)`           | Takes it away at once, with no fade                                  |
| `focus()`             | Focus to the newest toast's first button. The shell binds F6 to it   |
| `list()`, `subscribe` | Every toast, oldest first, and a listener for changes                |

Bottom right, 16px in, 360px wide (`w-toast`), 8px apart, newest at the bottom, at
`--layer-toast`. A card is `surface-raised`, 12px radius, `shadow-2`: the tone's icon, the title,
one line in `fg-muted`, at most one action as an `accent-text` text button on the title line
(underlined on hover, no fill), and a close button named "Close" and the title. Tones are those of
the Status chip: `success`, `info` (accent), `running`, `warning`, `danger`. Only the icon carries
the tone; the box is the same for all. It fades in and out in 120ms; nothing slides. In forced
colours a transparent outline becomes its edge.

| State   | What happens                                                                               |
| ------- | ------------------------------------------------------------------------------------------ |
| Default | `success` and `info` close after 5s, 10s with an action. `running` and `warning` stay      |
| Hover   | No change in look; the timer pauses. A finger on it pauses it too                          |
| Focus   | The action and close button take the ring; the timer pauses. Pressing the action closes it |
| Error   | `danger`: `role="alert"`, stays until closed. The other tones are `role="status"`          |
| Many    | On desktop at most three; a fourth closes the oldest                                       |

**While a kit Dialog is open,** everything outside it is inert, so toasts wait and show when it
closes; their timers wait too. They're in the page, visually hidden, from the moment they arrive.
A problem with what you're doing in the dialog goes in the dialog (a Field error or a Callout),
never in a toast.

**When the focused toast closes,** focus goes to the newest toast left, else back to where it was
before F6.

**On a phone** the region spans the width less 16px each side, 8px above the bar at the bottom,
with nothing measured. One toast shows at a time and the rest wait in order. The close button is
48px, set into the padding so the toast isn't taller. The text and the action are one wrapping
group, so a long action ("Sign in with Google") goes under the text and lines up with it, while
"Undo" stays beside it.

## Other exports

The icons `AlertIcon`, `BackIcon`, `ForwardIcon`, `InfoIcon`, `MaximiseIcon` (⤢), `RestoreIcon`
(the restore mark) and `WarningIcon` are outline icons in `currentColor`, hidden from screen readers; the slot
they sit in gives them their size.
`useOpenExternal()` reads the `openExternal` service in force, and `placeIconNames` lists the
names a `PlaceIcon` knows. `packageName` is `"@halonicjs/studio-kit"`. The timings and counts the
components share are exported, so a test reads them instead of copying the number:

| Export                              | Value     | What it is                                                  |
| ----------------------------------- | --------- | ----------------------------------------------------------- |
| `CALLOUT_FILES_SHOWN`               | 3         | Files a Callout names before "and N more"                   |
| `COMMAND_COPIED`                    | "Copied"  | What a CommandBox says once the command is on the clipboard |
| `COMMAND_NOT_COPIED`                | a message | What it says when neither way of copying worked             |
| `SKELETON_AFTER_MS`                 | 300       | A loading List waits this long before it shows its skeleton |
| `STILL_LOADING_AFTER_MS`            | 10000     | After this the List says it's still loading, with Try again |
| `TOASTS_SHOWN`                      | 3         | Toasts on screen at once on desktop                         |
| `TOAST_CLOSES_AFTER_MS`             | 5000      | A success or info toast stays this long                     |
| `TOAST_WITH_ACTION_CLOSES_AFTER_MS` | 10000     | The same, when it has an action                             |
| `TOOLTIP_DELAY_MS`                  | 500       | How long the pointer rests before a Tooltip shows           |

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
