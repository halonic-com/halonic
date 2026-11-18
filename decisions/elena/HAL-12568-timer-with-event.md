# Decision: refuse a transition with both an event and a timer, and word two schema errors

- Task: HAL-12568 (from Nina's C41 docs check, HAL-12558 section 5)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12568 (Liam's review of this pull request on its task; a team decision with no board card, HAL-2282 rule: it adds a static check and rewords two error messages, no new flow or screen)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xPlb0uYbPsev4IOs2Tg8WJelIQ2micTpyzKmJIo2L8ejSdm8ur2JhFnkJzsCyyJbZlojtQ2gQsUQybT/7pbiAg==

## What changes

The requirement `workflow.validate` gains one error: a transition with both a named event and a
timer (`after`) is reported as `timer-with-event`, with a sentence that says to keep one of the
two or split it into two transitions. A plain timer (event `done`, the default) is not reported.
One example is added for it.

The requirement `format.workflow-file` gains three examples about messages: an unknown condition
kind is named and the allowed kinds are listed, a known kind written the wrong way says what it
takes, and `version: 2` says `version must be 1`. The codes and paths stay the same; only the
messages change from Zod's `Invalid input` words.

Nothing existing is removed or weakened. No test is changed in what it checks, skipped or
deleted; the guard test now also checks the message, and tests for each new case are added.

## Why

`halonic validate` accepted `{ event: approve, after: 1h }`, but a timer never fires on an event,
so at run time `--event approve` was refused and the approve path was silently gone. Raw schema
words such as `Invalid input: expected 1` and `Invalid input (invalid_union)` didn't say what was
wrong or what is allowed.

## Covers

- workflow.validate
- format.workflow-file
