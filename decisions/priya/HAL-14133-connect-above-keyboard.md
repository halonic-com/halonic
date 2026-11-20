# Decision: keep Connect above the keyboard when the address error shows

- Task: HAL-14133
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14133 (phone check 19 on HAL-1375; a small layout detail of the approved connect screen, decided by the team with Sofia on HAL-14141; Liam reviews)
- Kind: user-visible

## What changes

- When the address error shows, and when the window gets shorter while it shows (the keyboard
  opening), the connect page scrolls Connect into view with `block: "nearest"`: no further than
  needed, so the field and the error stay above it.
- On windows under 32rem high the connect screen has less space above the logo and the heading.
  Full-height screens don't change.
- Scrolling leaves a 1rem gap between Connect and the keyboard (`scroll-margin-bottom`, with 1rem
  of padding under the screen to scroll into), so Connect doesn't touch the keyboard on small
  phones (Sofia, HAL-14141).
- The requirement `studio.connect.field-errors` gains that sentence and an example. Nothing in it
  is removed or loosened.

## Why

In the board's phone check of Play 0.1.0 (464296), with the keyboard open and the error showing,
Connect was under the keyboard. The WebView keeps only the focused field in view, and the error
makes the form taller. The screen's order and wording stay as approved.

No test was weakened or removed. The six version-screen tests (`studio.connect.version-screens`)
moved unchanged from `connect-page.test.ts` into `connect-version-screens.test.ts`, to keep the
first file under the 500-line limit, so `connect-page.test.ts` runs fewer tests than before.

## Covers

- studio.connect.field-errors
- apps/studio/src/connect/connect-page.test.ts
