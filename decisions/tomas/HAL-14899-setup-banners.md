# Decision: the failed-run banner says the four config causes the CLI already words

- Approval: Paperclip task HAL-14899 (asked for by Liam in his review of halonic#4245 on HAL-14301; the words build on the approved C336/C337 wording, a team decision under HAL-2282); Julian signs this note in his review of halonic#4480
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:Jz/DmOthJyUDtUDNYwCgyq0mJndcVU14PZ6S0+viOtmBeoc2hAgcgCzJ5LbZJjlnaJMbBIc4v1GK4TtHFrIYAQ==
- Task: HAL-14899

## What changes

HAL-14301 (halonic#4245) added four setup causes to `app.run-failure`: `unknown-provider`,
`items-not-a-list`, `no-transition` and `task-without-agent`. `halonic run` says each in two lines,
what is wrong and what to do. Studio's failed-run banner fell back to "Halonic can't tell the cause
yet" for all four.

`runs.run-view.failure-banners` now lists a banner for each, with the CLI's two lines, the same facts
and the same fix. The provider's banner offers **Open Models** (on a phone "Fix this on your
computer: Models"), as the two older setup causes do. The three workflow causes offer **See the
step**, because their fix is in the step. The places that said "the two setup causes" now say "the
three setup causes fixed in Models", and three examples are added. A cause without the facts its
sentence needs keeps the general banner, as before.

## Why

The CLI and Studio should say the same thing about the same run. The requirement only grows: every
banner it described before reads the same, and no test is removed or weakened.

## Covers

- runs.run-view.failure-banners
