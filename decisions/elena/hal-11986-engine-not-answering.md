# Decision: say "the engine isn't answering" when Welcome gets no answer, and wait 10 s first

- Task: HAL-11986
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11986 (Sofia's UX check on HAL-11973 and microcopy 3.2, revision 96, HAL-8954 FR5; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible

## What changes

When the engine doesn't answer, a press on a Recent row or on the sample stays busy ("Opening…",
"Creating the sample…") and retries by itself. After 10 s Welcome shows "Can't open ~/Documents/Acme:
the engine isn't answering. It may still be starting." or "Can't create the sample in ~/Documents:
the engine isn't answering. It may still be starting." The raw shell text is never shown.

The requirement `shell.welcome-cant-open` gains these cases. No test was weakened or skipped.

## Why

The line read "The desktop shell gave no answer about the folder.", which is system text with a
capital after the colon and breaks the no-raw-error-text rule (HAL-11676, mc 1.4).

## Covers

- shell.welcome-cant-open
