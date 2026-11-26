# Decision: the not-available window no longer says "yet"

- Requirements: `feedback.unavailable` (`packages/studio/features/feedback/requirements/unavailable.md`),
  `studio.feedback-windows` (`apps/studio/requirements/feedback-windows.md`), one example only
- Task: HAL-18971, from Nina's words check on HAL-19210
- Approval: Liam approves this note in his review of this pull request on HAL-18971
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/l7GQDPOwHxILB0tjNsSUE21kWvP7T/ZjNEoLbyJFQUOns3mUID3QXVRwbbpEMP2ILB/PBLEwktellzoOKaDDQ==

## What changes

The feedback shortcut's window on a system where Studio can't take a screen still said "Studio
can't take a screenshot for feedback on this system yet." Nina's words check (HAL-19210) found
that "yet" promises a later feature, and the docs rule is to describe only what ships. The
sentence becomes "Studio can't take a screenshot for feedback on this system." Nothing else in
the requirement changes: the "Not now" button, Esc and the window never asking for a still stay
as they are. The example in `studio.feedback-windows` that quotes the sentence changes with it.

## Tests

No test was weakened. The `feedback.unavailable` test in `feedback-windows.test.tsx` and the
`studio.feedback-windows` test in `start-studio.feedback.test.ts` compare the new sentence, with the
same number of `expect` calls.

## Covers

- feedback.unavailable
- studio.feedback-windows
