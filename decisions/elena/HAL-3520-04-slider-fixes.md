# Decision: a held arrow key saves the Slider once, when it's let go, and the fill ends at the thumb's centre

- Approval: Sofia's design check on [HAL-3520](/HAL/issues/HAL-3520) left this to Elena and Liam; Liam (package reviewer) approves this note in review of the follow-up to #1055
- Kind: internal
- Task: HAL-3520

## What changes

Three changes to the `kit.slider` requirement:

1. **A held key.** It said the kit calls `onCommit` once for each key step. It now says a step
   from a single key press still saves at once, but while a key is held its repeats don't: the
   slider saves once, with the value it reached, when the key is let go or focus leaves the
   slider first, and only if the value moved. One example is added.
2. **The fill.** It said the track is `primary` from its start to the thumb. It now says to the
   thumb's centre at every value, so the fill no longer ends beside the thumb in WebKit.
3. **An unavailable thumb.** It now says an unavailable slider keeps its thumb `primary` under the
   pointer and while pressed, so it shows no hover or press look.

## Why

**The held key.**
Spec 18.6 says each key step is a pick, so it saves. A held arrow key sends a step about every
30ms, so a screen that saves through the settings file would write tens of times a second.
Sofia's design check flagged it; she offered either a debounce in each screen or the kit
saving once at the end of a run of steps. The kit does it, so no screen has to remember, and a
single press still saves at once, as the spec asks. Focus leaving counts as letting go, because
the keyup then goes to another element: without it the value reached would never save (Liam's
review of #1092).

**The fill and the unavailable thumb** come from Liam's review of #1055 (HAL-3604): they say what
the spec already meant, so the requirement matches what the Slider draws.

No test was weakened or removed: the per-step test stays, and tests are added for a held key,
for focus leaving while it's held, for a key held at an end, for the fill and for the
unavailable thumb.

## Covers

- kit.slider
