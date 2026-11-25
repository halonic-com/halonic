# Decision: a rebase-only re-review on Liam's paths goes to Liam, not Julian

- Approval: Paperclip task HAL-18201; Liam approves this note in review
- Kind: internal
- Task: HAL-18201

The PR watcher sent every pull request Liam approved and that was only rebased since to Julian
for a `git range-diff` re-approval, whatever its paths. Since HAL-18190 (#5965), Julian's
rebase-only re-approval doesn't count on Liam's paths (`pr_status` and the Merger's
`outsideJulianScope` both ignore it), so that handoff cost a round and the task came back to Liam
anyway. Now such a pull request goes to the reviewer of its paths: Liam on his paths (unless he
wrote it, then Julian as before), Julian within Julian's limits.

## Covers

- `paperclip.pr-watcher-rereview`
- `paperclip.pr-watcher-handoff`
- `paperclip.pr-watcher-stack-rebase`

## What changes

- The requirement `paperclip.pr-watcher-rereview` no longer sends every rebase-only pull request
  Liam approved to Julian: it goes to the reviewer of its paths. Its first example (a rebase-only
  pull request on Liam's paths) now expects Liam and no "Julian: re-approved" line; a new example
  keeps Julian with that line within Julian's limits.

- The test "sends a rebase-only push after Liam's approval to Julian, with the re-approval line"
  becomes "sends a rebase-only push after Liam's approval on Liam's paths back to Liam" and
  expects Liam; a new test "… within Julian's limits to Julian, with the re-approval line" keeps
  the old expectation where it still holds.

- The requirement `paperclip.pr-watcher-handoff` says a rebase-only pull request goes by the same
  path rules, with an example.

- The requirement `paperclip.pr-watcher-stack-rebase`'s first example (#5674, on Liam's paths
  in its test) now says the rebased child goes to the reviewer of its paths, and its test "(a) a
  child moved to main …" expects Liam instead of Julian; its
  comment check reads "only a rebase since" (the handoff line for Liam) instead of "rebase only"
  (which came from Julian's re-approval line).

- `reviewerAfter` in `pr-watcher/handoff.ts` is removed: with this rule it always returned the
  reviewer of the paths.

## Why

A handoff to Julian whose approval can't count wastes a review round. Liam's approval on a pure
rebase usually carries over by patch-id at the Merger; when it doesn't, only Liam's new approval
does.
