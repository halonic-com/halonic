# Decision: first-run polish from the 0.2.0 walk-through (G8, G9, G11 to G14)

- Approval: HAL-19399, from Sofia's first-run walk-through of the 0.2.0 build (HAL-19383); team
  decisions on details of approved screens, no board card
- Kind: user-visible

## What changes

`inbox.wait-card` (G8): on a desktop the answers sit in one right-aligned row at their natural
width, the first at the right end, as Approve is on the approval card; the full-width first answer over a row of the others stays on the
phone. Stretched across a 730 px pane, Approve and Reject read as one bar. Three tests in
`wait-card.test.tsx` that held the buttons' desktop order now hold the new order, with the same
labels.

`shell.focus-ring-after-pointer` (G9, new): after a pointer press, a heading that code focused
keeps focus but shows no ring; the next key press, not a modifier alone, shows it again. Welcome's
start line, which code also focuses, follows the same rule. WebKit counts every focus from code as
visible, so the Inbox title was ringed after a click on **Open demo**; the mark outlasts the frame
Welcome swaps for the workspace's.

`shell.welcome-start` and `shell.welcome-sample` (G11): while Halonic's start has turned **Open
demo** and **Open folder** off, "New here? The demo takes about 4 minutes." is hidden and focus moves from the turned-off button to the line, then back to the
leading button once the start is ready.

`shell.welcome-sample` (G12): the **Demo** tag sits right after the name at any width, not at the
row's right on a desktop. The test that held the desktop's right-hand tag now holds the tag after
the name on both, and the row's text reads "AcmeDemo~/Documents/Acme sample".

`inbox.approval-phone` (G14): on a phone the row under the decided line starts at the left, and
"Nothing else is waiting for you." goes on "See what it did in Studio on your computer."

The phone tab bar's count (G13) moves inside the pill; `shell.phone-bars` doesn't say where,
so its text is unchanged.

No example was removed. G10 (the served Inbox's proposals line) isn't in this change: a served
window has no proposals source, so it can't tell when there are any; it goes to its own task.

## Why

Each is a Low gap from the walk-through, a detail of a screen the board approved, bundled into one
pull request as the bundling rule asks.

## Covers

- inbox.wait-card
- inbox.approval-phone
- shell.welcome-start
- shell.welcome-sample
- shell.focus-ring-after-pointer
