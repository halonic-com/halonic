# Decision: refer to the board by role

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16851 (approved by the board on 23 Nov; this pull request is HAL-16852)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yGAtoOTPCpaetjkTRxCrZD/K3jZSwdMxXBXASrjI8bwLkhoo0gxB8/9oqZ52Y5R3exsNtnow2/EFSoV0OxuuDw==

The repo is public, and a board member's name and GitHub login were written
into its files. The board asked for them to go: files say "the board", and
tests use the placeholder login `board-member`.

**What changes.** Only wording, except in one place. The decision notes below
already on `main` get "the board" (or nothing, where the line already said
"the board") in place of the name; their dates, tasks and decisions stay as
they were. The five requirements below change only in their `Source:` line or
in the login their text and examples name; what each one requires is the
same. The fast-track rules (`paperclip.fast-track-rules`) no longer hard-code
the board's login: they read it from the plugin setting `fastTrackLabelAdder`,
and while it isn't set no `fast-track` label counts for a jump. The board's
server session sets it on the deployed plugin. The board-ask pattern drops the
name and keeps its board wording.

Nothing is weakened: no test or check is removed, and an unset login fails
closed. Old commits keep the old text; history isn't rewritten (HAL-51).

## Covers

- paperclip.fast-track-rules
- paperclip.queue-state
- engine.task-answer-retries
- events.agent-answer-retried
- format.agent-answer-retries
- decisions/elena/HAL-16441-answer-retries.md
- decisions/liam/HAL-15461-size-headroom.md
- decisions/mateo/HAL-12539-05-desktop-out-of-queue.md
- decisions/mateo/HAL-14812-02-installer-elevates.md
- decisions/mateo/HAL-14831-01-self-hosted-routing.md
- decisions/mateo/HAL-15167-ci-large-speed-up.md
- decisions/mateo/HAL-15187-main-push-concurrency.md
- decisions/mateo/HAL-15465-main-skip-merged.md
- decisions/mateo/HAL-15694-merged-lookup-race.md
- decisions/mateo/HAL-15889-hourly-desktop-run.md
- decisions/mateo/HAL-15889-hourly-kick.md
- decisions/mateo/HAL-15930-ci-dynamic-memory.md
- decisions/mateo/HAL-15972-01-fast-pool-runner.md
- decisions/mateo/HAL-15972-02-fast-track-routing.md
- decisions/mateo/HAL-16032-fast-pool-snapshot.md
- decisions/owen/HAL-16095-merge-group-speed.md
