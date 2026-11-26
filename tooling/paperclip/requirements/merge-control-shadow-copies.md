# paperclip.merge-control-shadow-copies

- Status: active
- Since: unreleased
- Source: HAL-19324, phase 1.2 of the HAL-19228 plan

While merge control is in `shadow` mode, for each pull request whose gate passed on a pass, the plugin shall check whether Liam's or Julian's agent posted the approval of its full 40-character head on the task its branch names (`paperclip.pr-tools-approval-copy`), checking a head without a copy again after 15 minutes, and the daily diff shall list each pull request whose newest check that day found none under "Needs a Paperclip copy with a full-SHA match", with `copy: no` or `copy: unknown`. Merge control shall refuse nothing for it.

## Examples

- Given #41 with a GitHub approval and a gate that passed, and no copy on its task,
  when the day's diff is posted,
  then it lists `#41 on <head> (copy: no)` under "Needs a Paperclip copy with a full-SHA match" and merge control's decided actions are the same as without the check.
- Given #42 whose gate passed and whose task has Liam's copy of its full head,
  when the day's diff is posted,
  then #42 isn't listed.
- Given a pull request without a copy checked at 10:00,
  when its copy appears and a pass at 10:20 checks it again,
  then it isn't listed.
