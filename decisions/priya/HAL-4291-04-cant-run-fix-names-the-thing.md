# Decision: the can't-run Callout's fix names the thing for every reason, on a phone too

- Task: HAL-4291 (design check CF1 on the Callout from PR 1, carried in PR 3 of 4)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-4291 (the designer's check C410 of HAL-14518, decided by the team under HAL-2282: the new fixes and the phone line; the words stay placeholders by key until HAL-1784)
- Kind: user-visible

## What changes

- `app.sandbox-start-words`: the can't-run Callout's fix shall never say "it" or "them" for the
  thing the reason names. Seven more reasons get a fix of their own that names it
  (`not-supported`, `blocked-by-policy`, `virtualisation-off`, `wsl-missing`,
  `linux-tools-missing`, `ripgrep-missing`, and `not-offered` from HAL-12649). A new part, the can't-run Callout's fix for a phone,
  is that fix after "On the computer Halonic runs on: ", with a lower-case first letter.
- `runs.sandbox-cant-run`: on a phone the Callout shows that new part instead of the phone fix.

`calloutFix` and `phoneFix` are unchanged, so the Inbox card, the run page banner and Settings,
which show the reason first, read as before. Nothing the requirements promised before is taken
away: the "every part" example now counts the new part too, and two examples are added for it.

## Why

The Callout shows the reason only for `other`, so "install it, …" leaves the person guessing what
"it" is (microcopy 23.3). On a phone every reason read that way, because the phone line was built
from the short fix.

## Tests

No test was weakened or skipped. `packages/core/app/src/sandbox-start-words.test.ts` checks every
reason's can't-run fix and its phone line; `sandbox-cant-run.test.tsx` checks the phone Callout.

## Covers

- app.sandbox-start-words
- runs.sandbox-cant-run
