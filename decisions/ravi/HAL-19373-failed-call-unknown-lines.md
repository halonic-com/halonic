# Decision: a refused call names its cause with the outcome `unknown` too

- Approval: the wording and the narrower `sentOnce` are Chief's team decision on HAL-19373 (26 Nov), built on the lines approved on HAL-19275; Liam's rule on HAL-19172 (never claim "Nothing was sent twice." unless the log proves it) is unchanged; the task is HAL-19373, and its reviewer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:8GO4Hab7Ox+oGJhKgTV/AvJQfMtAQQ6mYthkDTb9uT+Zu2Ddea73rYfAYr7vJbvhWdY0Mh2m+RJePyIMzjbLCg==
- Task: HAL-19373

## What changes

- `engine.tool-result-cause` logs `sentOnce: true` only when at least one request other than a
  `GET` or `HEAD` went out in the call, and none went out twice. Before, a call that only read got
  it too. A call whose only `POST` the kit refused gets none either, since that request never
  went out.
- So `app.failed-call-line` no longer ends a read tool's 429 line with "Nothing was sent twice.":
  "…and still did after Halonic tried again twice. Nothing was sent twice." sounded like a
  contradiction for a tool that sends nothing.
- A refused call whose outcome is `unknown` (an earlier step may already have done its work) gets
  a line for its cause, one for each `why` (401, 403, 429, an undeclared host), instead of the
  plain "broke off without an answer" line. Each line has one next step, "Check before you try
  again", so it never says how often Halonic tried again or "Nothing was sent twice.".
- "Broke off without an answer…" stays for the outcome `unknown` without a cause.

## Why

Julian's review of #6395 (HAL-19186) found both gaps. The read tool's sentence was true but read
as nonsense. And with the outcome `unknown` the cause wasn't named at all, so a person with a
revoked token or an undeclared host learned only that the call broke off. The new lines still say
the call may have done its work, which is what Liam's PR 2 rule on HAL-19172 asks for. Only values
from the log fill them: the tool, its connector and the host's main part.

## Covers

- app.failed-call-line
- engine.tool-result-cause
