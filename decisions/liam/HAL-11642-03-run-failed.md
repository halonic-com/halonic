# Decision: the failed-run banner keeps the engine's message for Copy details

- Task: HAL-11642
- Approval: the states audit on HAL-11635 (https://paperclip.halonic.com/HAL/issues/HAL-11635#document-states-audit), gap 4, sent to Liam as HAL-11642 (https://paperclip.halonic.com/HAL/issues/HAL-11642). Microcopy 1.4 and 22 F13 are board-approved; this applies them. A team decision with no board card.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oe8KhHYAYNxsinjdfnsvVkL4V6TE0wC8tXXJK0yULHBUzGETfUIZX9pgN+6Wj7I7OVT654/WZ7g7279CpxdKCQ==

## What changes

When a run failed for a cause Halonic doesn't know, the run page's banner read "*Workflow* failed in
the step *step*. Halonic can't tell the cause yet: *engine message*". It now ends at "…can't tell
the cause yet." and gets **Copy details** after **Run again**. Copy details puts the sentence, the
run's id and the engine's message on the clipboard. One example in `runs.run-page` changes to
match. The new requirement `runs.run-view.unknown-cause-details` has its own tests. No test is
removed or skipped; the model test now checks the details as well.

## Why

The engine's message is a system message: it can name paths, programs or internals, and rule 1.4
and F13 say it goes only into Copy details.

## Covers

- runs.run-page
