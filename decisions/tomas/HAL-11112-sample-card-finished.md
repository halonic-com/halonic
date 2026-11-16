# Decision: the finished sample card offers Start your own workspace

- Task: HAL-11112
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11112 (reading "next Home visit" as the next workspace open is a team decision, HAL-2282 rule, reviewed in HAL-11126)
- Kind: user-visible

## What changes

When the sample workflow has run, the sample card on Home offers Start your own workspace. The card
goes away after that visit: the next time the workspace opens, Home no longer shows it.

The requirement `first-run.sample-card` gains these cases. No test was weakened or skipped.

## Why

A finished sample card used to stay on Home with nothing left to do. "Next Home visit" is read as
the next workspace open, so the card can't vanish while the user still looks at it.

## Covers

- first-run.sample-card
