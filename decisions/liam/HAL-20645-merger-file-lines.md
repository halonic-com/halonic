# Decision: the Merger counts Nora's line limit per file, and her outside-scope ask is due

- Task: HAL-20645, found by Nora on #6678
- Approval: Liam decided it as the Merger's owner on HAL-20645; Julian reviews the pull request and signs this note
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:8b2CJv25biMRcJqzRFFINgbc+M3VEoqbm/ohvSA5wTluaEebBz4D6lddTgZplydax4y6uSZAy2xmWMsco9gSCw==

## What changes

`paperclip.merge-control-nora-scope` now says how the gate counts her line limits: each
file's own changed lines from the pull request's file list, as `pr_status` does, so tests,
Markdown and wording don't count. The gate's snapshot keeps each file's additions plus
deletions (`GatePull.fileLines`) and `routedOf` passes them on. One new example: 1,819
changed lines with 1,222 of code is in her scope; 1,501 of code isn't.

`paperclip.merge-control-reviewer-tasks` now says the gate's `no approval from Liam found
for head …`, which comes with the outside-her-scope reason, is the same wait, so the ask is
due. One new example: with `mergeControl.noraShadow` set to `false`, an out-of-scope
approval by Nora still gives Liam one task.

## Why

The rule already left tests, Markdown and wording out of the limit (HAL-18459), and
`pr_status` applied it. Only the gate fell back to the whole pull request's lines, because
it had no per-file count. #6678 waited for Liam from 12:56 UTC on 27 Nov with Nora's valid
approval. The ask written for exactly that case (HAL-20636) was never due, so nothing woke
Liam either. Both edits make the requirements say what was intended; neither widens anyone's
scope beyond the written rule.

## Covers

- paperclip.merge-control-nora-scope
- paperclip.merge-control-reviewer-tasks
