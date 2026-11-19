# Decision: a phone tab is never narrower than its longest word, and tabs that don't fit go on to another row

- Task: HAL-13044
- Approval: team decision on the kit's approved Tabs under the HAL-2282 rule (Noah, kit owner, on HAL-13044); the reviewer of the pull request on HAL-13044 signs this note
- Kind: user-visible

## What changes

In the kit's `fill` tabs (on a phone, or with `fill` set), each tab used to be an exact equal part of the track, so a word wider than its part broke inside the word. Now the tabs still take equal parts, but a tab is never narrower than its longest word in the selected (bolder) weight, and the other tabs share what's left equally. An invisible bold copy of the label holds that width, so switching tabs doesn't move them.

At 320px the agent's Configuration list Behaviour · Model · Harness · Tools reads "Behaviour" on one line instead of "Behavio / ur", and the other three share the rest. At 390px and wider nothing changes, and Runs · Configuration is still two equal halves.

When a list's words don't fit side by side, as at 200% zoom, the tabs go on to another row (`flex-wrap` on the track) instead of breaking every word letter by letter. Only a word wider than the whole track breaks.

The `fill` tabs no longer hyphenate (`hyphens-auto` is gone): a hyphenation point would shrink a tab's minimum width to the word's longest piece, so on Apple's WebKit "Behaviour" would still split as "Behav- iour".

The `kit.tabs` requirement says so and gains one example. The `fill` test no longer expects `min-w-0`, `hyphens-auto` or no width copy, the old behaviour this note changes; a new test checks the minimum width, the wrap and the width copy. No test was skipped.

## Why

Found at 320px while checking #3749 (HAL-12783) for Sofia's C117 note. A word cut in half is harder to read, and the other three tabs had room to spare. `min-w-0` was there so a list whose words are wider than the column can't push the page sideways; wrapping the tabs on to another row keeps that promise without cutting words.

## Covers

- kit.tabs
