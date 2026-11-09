# @halonicjs/studio-kit

The Studio's design tokens: every colour, text style, size, radius, shadow and motion value, in one
file (`src/theme.css`), for light and dark mode, and the shared base components, which arrive one
by one. So far: [`StatusChip`](#statuschip), [`Kbd`](#kbd), [`CopyButton`](#copybutton) and
[`ExternalLink`](#externallink).

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

## StatusChip

The state of an item, in a row, a card header or a panel. It isn't interactive: something you can
click is a Button or a row, never a chip.

```tsx
<StatusChip tone="running" dot>
  Running
</StatusChip>;
<StatusChip tone="outline">Test</StatusChip>;
<StatusChip tone="accent" shape="count">
  3
</StatusChip>;
```

| Prop    | What it is                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tone`  | `neutral` (the default), `accent`, `running`, `warning` ("Needs you"), `danger`, `success`, and `outline` for a tag such as Test |
| `dot`   | A still 6px dot before the word, for a live state                                                                                |
| `shape` | `count` for the round counter on a sidebar item or a tab, with tabular figures                                                   |

Always a word or a number: the colour is never the only sign. Each coloured tone is its colour on
its own `-soft` fill. Every chip carries a 1px see-through edge, which Windows high-contrast mode
draws, and which turns the chip's own colour when the system asks for more contrast. A tag's
edge is always `border-strong`.

There's no hover, focus or disabled state, and the `danger` tone is the error state. On a phone the
chip keeps its size; when it doesn't fit beside a row's title, the row puts it under the title.

## Kbd

A keyboard shortcut in a menu, the command palette or a tooltip: one box per key.

```tsx
<Kbd keys={["Ctrl", "K"]} />;
```

The shell passes "Ctrl" or "⌘" for the platform. Not interactive, and hidden on a phone, where
there's no keyboard to press it on.

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
