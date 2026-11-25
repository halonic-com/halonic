# Decision: merge control takes a pull request out at once when its own merge group fails, and labels approved team pull requests that have no built-on label

- Task: HAL-18506
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18470 (Chief's request to mirror both live Merger changes, 25 Nov 12:19 UTC; the live Merger runs them since 12:16 UTC, HAL-18424; the reviewer approves this note in review)
- Kind: internal

Merge control now dequeues a queued pull request in the same pass when its own merge group ends `failure`, instead of waiting for GitHub to take it out, and adds `built-on:paperclip` to an approved, green pull request by the team account or the board's queue login that has no `built-on:*` label, so the plugin decides the same as the live Merger.

## What changes

- `paperclip.merge-control-culprit-hold`: the hold now also applies when merge control took the pull request out (new `paperclip.merge-control-dequeue-at-failure`), not only GitHub. The example "a failed group whose pull request is still queued: nothing is held" now reads "a group cancelled with a failed job": a `failure` group no longer waits. The `culprit.test.ts` case for it uses a cancelled group instead of a failed one; its expectations stay as they were. No other test or `expect` is removed or weakened.
- `paperclip.merge-control-write-scope`: the write client may also add a label, as a POST to `/repos/<repo>/issues/<n>/labels` on the repository it acts on, with `{"labels":["built-on:paperclip"]}` as the only body it accepts. "Eight allowed writes" becomes nine. Every other refusal stays.
- `paperclip.merge-control-decide-file`: the rules file answers with `format` 3, since a format-2 Merger doesn't carry out the new `add-label` action and would post a dequeue's empty comment. The format test expects 3. The Merger passes the board's queue login as `autoLabelAuthors` in the settings it hands in, as it does `fastTrackLabellers`.
- New `paperclip.merge-control-dequeue-at-failure` and `paperclip.merge-control-auto-label`.

## Why

- **Same rules as the live Merger.** Since 25 Nov 12:16 UTC the live Merger dequeues at group failure and auto-labels. The plugin must decide the same, or the shadow diff counts both as disagreements.
- **Dequeue at failure.** GitHub can take minutes to take a failed pull request out; until then it sits in the queue and the groups behind it build on a group that already failed. A `cancelled` group or one the runner hook refused isn't a failure of the pull request, so those still wait.
- **Auto-label.** A team pull request opened without the label is never a candidate, so it waits out of the queue though it is approved and green. Only the label the `built-on-label` check expects is added, and the next pass gates it as usual.
- **Permissions.** No new token scope: adding a label uses the same write access the queue credential already uses to comment on pull requests. Only the client's allowlist grows, by one path with one fixed body; Julian OKs that before review.

## Covers

- paperclip.merge-control-culprit-hold
- paperclip.merge-control-write-scope
- paperclip.merge-control-dequeue-at-failure
- paperclip.merge-control-auto-label
- paperclip.merge-control-decide-file
