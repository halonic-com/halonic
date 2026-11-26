# Decision: the not-available window no longer says "yet"

- Requirements: `feedback.unavailable` (`packages/studio/features/feedback/requirements/unavailable.md`)
- Task: HAL-18971, from Nina's words check on HAL-19210
- Approval: Liam approves this note in his review of this pull request on HAL-18971
- Kind: user-visible

## What changes

The feedback shortcut's window on a system where Studio can't take a screen still said "Studio
can't take a screenshot for feedback on this system yet." Nina's words check (HAL-19210) found
that "yet" promises a later feature, and the docs rule is to describe only what ships. The
sentence becomes "Studio can't take a screenshot for feedback on this system." Nothing else in
the requirement changes: the "Not now" button, Esc and the window never asking for a still stay
as they are.

## Tests

No test was weakened. The `feedback.unavailable` test in `feedback-windows.test.tsx` compares the
new sentence, with the same number of `expect` calls.

## Covers

- feedback.unavailable
