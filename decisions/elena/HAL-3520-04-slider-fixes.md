# Decision: a held arrow key saves the Slider once, when it's let go

- Approval: Sofia's design check on [HAL-3520](/HAL/issues/HAL-3520) left this to Elena and Liam; Liam (package reviewer) approves this note in review of the follow-up to #1055
- Kind: internal
- Task: HAL-3520

## What changes

The `kit.slider` requirement said the kit calls `onCommit` once for each key step. It now says a
step from a single key press still saves at once, but while a key is held its repeats don't:
the slider saves once, with the value it reached, when the key is let go. Nothing else in the
requirement changes, and one example is added.

## Why

Spec 18.6 says each key step is a pick, so it saves. A held arrow key sends a step about every
30ms, so a screen that saves through the settings file would write tens of times a second.
Sofia's design check flagged it; she offered either a debounce in each screen or the kit
saving once at the end of a run of steps. The kit does it, so no screen has to remember, and a
single press still saves at once, as the spec asks.

No test was weakened or removed: the per-step test stays, and a held-key test is added.

## Covers

- kit.slider
