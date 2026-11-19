# Decision: the sandbox-start words give the can't-run Callout its own fix

- Task: HAL-4291 (the Callout and its check, PR 1 of 4)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-4291 (the CTO's scope for this task: checklist Part 3 of HAL-1833 and microcopy 23.3; the words stay placeholders by key until HAL-1784)
- Kind: user-visible

## What changes

The requirement `app.sandbox-start-words` gains a sixth part per reason, the fix for the
can't-run Callout, and the command a fix names:

- The can't-run Callout shows no reason before its fix, so "Install it, …" can't stand alone
  there. For `bubblewrap-missing` and `user-namespaces-restricted` its fix names the thing, as
  microcopy 23.3 writes it ("Install bubblewrap, …"). For every other reason it is the Callout
  sentence, as before (microcopy 23.3a).
- Where a fix names a command, the words give that command too, exactly as the fix writes it, so
  the Callout can show it as code (checklist 3.2).

The Callout sentence `calloutFix` is unchanged, so the Inbox card and the run page banner, which
show the reason first, read as before. Nothing the requirement promised before is taken away: the
"all five parts" example becomes "all six parts", and one example is added for the new fix.

## Why

Checklist 3.2 asks the Callout to lead with a fix that makes sense without the reason, and to show
the command as code. A separate part keeps the screens that already show the reason unchanged.

## Tests

No test was weakened or skipped. `packages/core/app/src/sandbox-start-words.test.ts` checks the new
part for every reason and that each command appears in its fix word for word.

## Covers

- app.sandbox-start-words
