# paperclip.thin-spec-outcome

- Status: active
- Since: unreleased
- Source: HAL-17355, part 2 of HAL-17322; the week's read-out of scores against outcomes on HAL-17077

When the PR watcher's pass runs for a company, the Agent tools plugin shall, for each task the thin-spec check (`paperclip.thin-spec-check`) logged in the last 14 UTC days that has no outcome yet, find its pull requests by branch name in the pass's snapshot, and only once it has at least one and all of them are closed, log one outcome for it in that check day's company outcome log (`outcome-<day>`, beside `log-<day>`): `not_merged` when none merged, otherwise `rework` when any of them had a review or conversation comment by a reviewer (owner, member or collaborator) that requests changes or asks for them by the PR watcher's rule, a red `ci-ok` on a commit before its final head, or a reopening, and `first_try` when none had; it shall keep every reason found, decide each task once, read GitHub only for tasks it decides in that pass, put neither task text nor comment text in a log line or a metric, and never let a failure stop the watcher's own work.

## Examples

- Given HAL-1 checked on 23 Nov and its one pull request merged with only a cancelled run before the green head,
  when the watcher's pass runs,
  then `outcome-2026-11-23` holds HAL-1 `first_try` and the log says "HAL-1 first_try".
- Given a reviewer's "[major] …" comment or a "changes requested" review on HAL-1's pull request,
  when it merges,
  then HAL-1 is logged `rework` with `changes_requested`.
- Given a red `ci-ok` on an earlier commit and a reopening,
  when the pull request merges,
  then the reasons are `changes_requested`, `red_ci_ok` and `reopened` as found.
- Given a stranger's "[blocker]" comment or a reviewer's "[nit]",
  when the pull request merges,
  then HAL-1 is `first_try`.
- Given HAL-1's pull requests all closed without merging,
  when the pass runs,
  then HAL-1 is logged `not_merged`.
- Given one of HAL-1's pull requests still open, or none yet,
  when the pass runs,
  then nothing is logged and GitHub isn't asked.
- Given HAL-1 already has an outcome,
  when the pass runs again,
  then it isn't asked about or logged twice.
