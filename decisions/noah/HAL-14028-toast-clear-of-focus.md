# Decision: on a phone, a toast that would cover the focused element sits at the top

- Task: HAL-14028
- Approval: team decision under the HAL-2282 rule for a detail of the approved toast (Noah owns the kit's look); Liam reviews the pull request on HAL-14028 and signs this note
- Kind: user-visible

## What changes

On a phone (narrower than 600px), when the drawn toast would cover the element that has focus, the toast region sits at the top for that toast: 8px under the top bar, or 8px under the window's top once a short window has scrolled the bars away. If the toast would cover the focused element at the top as well (a tall text area), it stays at the bottom. The next toast starts at the bottom again. Desktop is unchanged, and so is a phone where the toast doesn't cover the focused element. What a toast says and how long it stays don't change.

The new `kit.toast-clear-of-focus` requirement says so. `kit.toast` is unchanged. No test was weakened or skipped.

## Why

The UX check C289 (HAL-14012, TO1) found that at 195 × 421 (400 % zoom) a toast made by a button press covers that button for as long as it shows, 10 s with an action (WCAG 2.4.11 Focus Not Obscured). It happened with **Go back to this version** (#4113) and with **Restore just this**, already on `main`, where the menu hands focus back to its ⋮. Fixing it in the kit's region fixes every toast, not one page.

## Covers

- kit.toast-clear-of-focus
- packages/studio/kit/src/toast/toast-clear-of-focus.test.tsx
