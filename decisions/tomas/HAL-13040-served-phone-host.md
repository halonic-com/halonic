# Decision: the served Studio on a phone runs as host `phone`

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13040
- Kind: user-visible

## What changes

`studioHost()` now returns `phone` when the page is not in the desktop app's webview and the
browser's main pointer is a touchscreen (`(pointer: coarse)`). Any other browser stays `served`,
however narrow its window. Nothing else in the shell changes: it already treats every host other
than `desktop-app` as the served Studio (Settings place, window keys, resources item).

What a user on a phone opening `halonic serve` sees:

- Once the served Studio has Library, a connector's page shows the approved view-only line
  instead of **Review tools** (`library.listed-tools-waiting`, HAL-10084).
- The engine status texts use the approved phone words ("Halonic on your computer isn't
  answering.") instead of the served ones ("Halonic on the server isn't answering."). Microcopy
  1.2 gives these words to the phone that talks to Halonic on the user's computer, which is what
  this phone does.

No new words. The requirement `studio.entry` gains the sentence and two examples. A test starts the
Studio in a page whose `matchMedia` says touchscreen and reads the started Studio's host, so it
starts from the real host value, not a hand-made context.

`start-studio.ts` and its test went over the 500-line limit, so `studioHost()` and
`keyboardPlatform()` move to `studio-host.ts`, and their tests ("runs as the desktop app in Tauri's
webview", "reads ⌘ on macOS and Ctrl elsewhere") move unchanged to `studio-host.test.ts`. That is
why `start-studio.test.ts` runs fewer of its own tests. No test was weakened or skipped.

## Why

The connector page shows the view-only line only when `context.host === "phone"`, but no Studio
window was ever host `phone`: the Android app never loads the Studio page, and `studioHost()`
returned only `desktop-app` or `served`. So once the served Studio gets Library, a phone would get
**Review tools**, which HAL-10084 set out to stop.

The pointer is used, not the width-based presentation, because the decision on HAL-10093 keeps a
served window in a desktop browser able to approve, also when it is narrowed to a phone's width.
A tablet also has a touchscreen as its main pointer and is treated as a phone, which matches
"approval is desktop only" (HAL-9855).

## Covers

- studio.entry
- apps/studio/src/studio/start-studio.test.ts
