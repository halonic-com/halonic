# Decision: list search reads its count, the Workflow chip keeps focus, routine cards are headings

- Task: HAL-14241
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14241 (details of approved screens, "Decided by the team" in the task under the HAL-2282 rule, from the C332 a11y check in HAL-14215)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Dp8jAB5BRIG/zHC0YSE39FP76XI4/ZzCqPGlykBqBQviDWKE0DGVkzgqLxIyyje1jHIMIMvg5S+3IG60db5YDA==

## What changes

- `shell.overview.search`: after a search or a hub change, a list page (Workflows, Agents,
  Routines, Library) reads, politely and once it settles, how many items it shows ("1 workflow.",
  "2 routines."), or its no-match line when it shows none. A refresh isn't read.
- `runs.list`: pressing the Runs page's "Workflow: *name*" chip puts the focus on Test runs, the
  chip before it, instead of dropping it to the page.
- `kit.card`: a card's caption label can be a heading, when the card is given a `headingLevel`.
  Without one it stays a plain caption, as before. The routine page's When and Starts use `h2`,
  next to its Rules `h2`, and look as they did.

No test was weakened or skipped; each requirement gains a case.

## Why

From the keyboard and screen-reader pass in C332 (rows LS1, RF1 and RP1 of the a11y sheet): a
search that found nothing said nothing (WCAG 4.1.3), the chip's press sent a keyboard user back to
the top of the window (WCAG 2.4.3), and heading navigation on a routine page found Rules but not
When or Starts.

## Covers

- shell.overview.search
- runs.list
- kit.card
