# Decision: the front bot rejects "it depends" and claims of missing context

- Task: HAL-19703
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19703 (Chief's task for the fixes listed under the step 1 live example on HAL-19136, 26 Nov 06:48 UTC: notes restate the ask or SKIP, and never claim "no prior context"; Julian's security review of #6549 signs the grounding change)
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:Y4A3Pw8/L5+x0h4NgLP2G7eJAPaZX7nqBBZZzvaGnAQwp90fKsG6MUVJaO+BOr0009ChkG/M0O0I9Y84R5OgAg==

## What changes

`paperclip.front-bot-grounding` gets two new reasons, checked after all the
existing ones:

- `context_claim`: a line that says the bot was given no context, history,
  information or details, or not enough of them ("there's no prior context in
  this task").
- `non_answer`: a line that says the answer depends on something ("The answer
  depends on your current forks", "It depends").

"depends" is no longer on the fixed list of common words. Two examples are
added to the requirement and four must-fail cases to the tests. The existing
must-fail cases keep their reasons. No test is skipped or deleted, and no
requirement is retired.

## Why

All three notes in the first live example on HAL-10 said "the answer depends
on…", which reads like a reply but says nothing. One said there was no prior
context. The bot reads only part of the task, so it can't know that, and the
claim was wrong. The prompt now asks the bot to restate the ask or answer
SKIP, and the check makes sure neither kind of line is posted.

## Covers

- paperclip.front-bot-grounding
