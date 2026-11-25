# paperclip.merge-control-not-queued-reason

- Status: active
- Since: unreleased
- Source: HAL-18735; the slow-tail research on HAL-18424 (HAL-18729, 25 Nov), where approved, green pull requests waited 108 hours in one day without being told why

When an open pull request is approved on its head and has a green `ci-ok` there but has not been queued for 30 minutes, the plugin shall post once per head a note naming every reason the gate and the fill give, leaving out a reason another note already gave on that head.

## Examples

- Given an approved, green pull request that conflicts with `main`,
  when a pass runs 29 minutes after it was first seen that way, then one at 31 minutes, then another,
  then only the pass at 31 minutes posts a note, and it names the conflict.
- Given that pull request with a new head, still not queued,
  when a pass runs at once and another 30 minutes later,
  then the first posts nothing and the second posts a new note.
- Given an approved, green pull request that shares a hotspot with queued #2, or is held by the board,
  when it has waited 45 minutes,
  then the note names #2 and the file, or the board's reason.
- Given an approved, green pull request GitHub shows as blocked,
  when it has waited 45 minutes,
  then only the blocked note is posted.
