# paperclip.merge-control-author-wake

- Status: active
- Since: unreleased
- Source: HAL-17907; the merge-time report on HAL-17891, item 5; the merge controller ADR (HAL-17700), "Every event wakes the right agent at once"

When the plugin takes a pull request out of the merge queue, or holds it because its merge group failed, the plugin shall wake the task its branch names (`<agent>/HAL-<n>-…`) once per event and head, with the reason or the failed jobs and the command to run for each, and shall wake nobody for a branch outside the repository or a branch that names no task.

## Examples

- Given a queued pull request on `mateo/HAL-5-thing` that conflicts with `main`,
  when a pass runs,
  then `HAL-5` is woken for `mateo` with the conflict and `git fetch origin && git rebase origin/main`, and a second pass on the same head wakes nobody.
- Given a failed merge group of that pull request in `Typecheck, lint, test, build (core)` and `Leak guard`,
  when GitHub has taken it out,
  then `HAL-5` is woken with both job names, the run, and the turbo and leak guard commands.
- Given a queued pull request from a fork, or on a branch that names no task,
  when it is taken out,
  then nobody is woken, and the second is logged.
