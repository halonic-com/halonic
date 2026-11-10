# Decision: on a phone the Input's leading button is 48 by 48 and the text starts at 56px

- Approval: Noah's visual check of #1061 asked for it; Liam (package reviewer) said a follow-up is fine on [HAL-3670](/HAL/issues/HAL-3670) and approves this note in review
- Kind: internal
- Task: HAL-3520

## What changes

The `kit.input-leading-button` requirement said that on a phone the text starts right after the
48px hit area. It now says the hit area is 48 by 48 from the box's outer edge and the text
starts 8px after it, at 56px, as on a computer, where it starts 8px after the 24px hit area.
Nothing else in the requirement changes.

## Why

The button pulled back the box's padding but not its 1px edge, so its hit area was 48 by 46
(Liam's review) and the text started at 49px, against the button's focus ring (Noah's visual
check of T1-F46, which draws the text about 57px in). The button now also covers the edge, and
the box keeps its 8px gap.

No test was weakened or removed: the class test now checks the 48 by 48 classes and the 8px gap.

## Covers

- kit.input-leading-button
