# Decision: `trust --plugin`'s requirement says how it refuses a broken plugin

- Task: HAL-14609 (follow-up to HAL-13799 and #4059, from the docs check on HAL-14605, N1)
- Approval: HAL-14609 asks for this change; Liam approves this note in review
- Kind: user-visible

## What changes

`cli.commands.trust.plugin` gets one sentence and one example for what the command already does
since #4059: a plugin that can't be read or checked is refused and stays off, with its first
problem after the path of the field it is about, control characters and text-direction marks
taken out, and the fix "Remove it with halonic plugin remove <id>, then add a version that
works." (exit 2). The example is the U+202E test from #4059, which now also checks that fix
line, so the requirement's tests make one more `expect` call, not fewer.

Nothing the requirement said before changes; the command's behaviour doesn't change.

## Why

The requirement didn't describe the refusal, so #4059's test checked behaviour no requirement
sentence stated.

## Covers

- cli.commands.trust.plugin
