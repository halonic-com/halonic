# Decision: on a phone, a save problem shows in a strip under the top bar

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-8692 (Noah's spec after Sofia's UX check on HAL-8421, building on the layout the board approved on HAL-8416; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Task: HAL-8421

## What changes

- On a phone, the save note had nowhere to show since the toolbar row went: the phone has no status bar. Now the frame shows it in a strip under the top bar and the engine's line, only while it's a problem (fields not saved, items not saved, failed), with the problem's soft fill edge to edge. "Saved" and "Saving…" show nothing, so a calm phone has no strip.
- The words take the width the action leaves and end in "…" (on the desktop they still stop at 240px), and the action keeps its place at the right end.
- The header badges are not in the strip yet. The kit's `HeaderBadge` has its own phone form (component specs 20.1: a 48px line on the More page, and a sheet in place of the sample chip's menu), which doesn't match the wrapping chips Noah's spec draws for the strip. I asked Noah to settle that before they move.

## Why

Sofia's UX check found that a failed save was invisible on a phone. Noah's spec on HAL-8692 places it. `shell.save-note` gains the phone strip, and `shell.phone-bars` names it in the phone's order of bars. No test was weakened or removed; new unit tests cover the strip's place and classes, and a new e2e page and spec (`e2e/save-problem.spec.ts`) check the fills, the strip and the status bar button's height in a real browser.

## Covers

- shell.phone-bars
- shell.save-note
