# Decision: a run waiting for tool approvals shows each call, and the answer names it

- Task: HAL-16382, a follow-up from HAL-16338 agreed by Liam on 22 Nov
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16382 (the task asks for `--call` and the call ids where approvals are listed; the words are a team decision with Sofia under the HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2FRWTi8I4od75qJeHYRe+bLDI1GxvIiKKNvhi1w3wZ0zv3PlRdZ9O3xRvDuO2LBpZoOl9yCx1GcO9A07BX5CDQ==

## What changes

Only the end of the output of `halonic run`, `halonic runs show` and `halonic runs send` when a run waits for tool approvals. Each `! Waiting for your approval: <agent> wants to use <tool>` line now ends with `(call <id>)`, and the `Answer with:` command names the oldest call, `halonic runs send <id> approve --call <call id>`. With more than one approval, the line under it said `Each answer settles the first one listed.`; it now says `To answer another one, put the call from its line after --call.`, since the command answers the call it names. `cli.commands.runs.show` says so instead of the old line. Nothing else it says changes.

## Why

A `runs send` typed twice by mistake answered whichever approval waited next. With the call in the command, the second send is refused with "someone answered that approval first." (`cli.commands.runs.send-call`). The old line under the answer would now be wrong: the command no longer takes the first one listed by itself.

## Covers

- cli.commands.runs.show
- apps/cli/src/commands/runs/show.test.ts
