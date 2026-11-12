# Decision: a feature view that fails to load shows nothing in the status bar, and Home's error

- Requirement: `shell.status-bar` (`packages/studio/shell/requirements/status-bar.md`), `shell.home-states` (`packages/studio/shell/requirements/home-states.md`)
- Task: HAL-3926, from Liam's review of #1191 on HAL-3923
- Approval: Liam asked for the change on HAL-3926; he approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:G7TGevWs16lKwcy/A7Y7igM7gROyYhCYg0pxqoesDWmW0uFt3DW7+GMKFRCm4o4+7MwxjoSDInFefQ96k6jKBg==

## What changes

Each status bar item's view now sits in an error boundary. An item whose view fails to import, or
names a view its module doesn't export (`loadView` throws a `ShellError`), shows nothing, and the
other items and the rest of the frame keep working. Before, the error went past `Suspense` and
unmounted the whole frame.

`shell.status-bar` gains the sentence for a failed item and an example for a view that isn't
exported. `shell.home-states` already covered a card that fails to load: it gains an example for a
card whose view isn't exported, which shows the section's "Couldn't load" error with Try again.

## Why

One broken feature shouldn't take down the window. In the status bar, nothing stands in for a
missing item (UX section 0), so a failed item shows nothing. Home keeps the error it already shows
for a failed section (UX checklist 1.9, microcopy 3.3): a wrong view name is one more way a card
fails to load, so it gets the same error, not a new state.

The error is still reported: React logs every error a boundary catches with `console.error`, and
names the boundary in development. The boundary doesn't log it a second time.

## Tests

No test was weakened. The status bar tests gain a misnamed view and a failed import, each next to
an item that loads and the rest of the frame; the first also checks that the `ShellError` was
reported. Home's tests gain a misnamed card next to a card that loads. Both status bar tests fail
without the boundary.

## Covers

- shell.status-bar
- shell.home-states
