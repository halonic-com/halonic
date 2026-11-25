# paperclip.merge-control-behind-main

- Status: active
- Since: unreleased
- Source: HAL-17909; the merge-time report on HAL-17891 (item 3)

When a pull request is approved, green and only behind `main` (GitHub's merge state `BEHIND`, no conflict), the plugin shall queue it or keep it queued and shall neither rebase it nor ask for a rebase; it shall ask for one only when the pull request conflicts.

## Examples

- Given an approved, green pull request behind `main`,
  when a pass runs,
  then it is enqueued with no branch update and no comment.
- Given the same pull request already queued, or one that conflicts,
  when a pass runs,
  then the first stays queued and the second isn't enqueued.
