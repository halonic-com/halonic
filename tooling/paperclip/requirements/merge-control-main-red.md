# paperclip.merge-control-main-red

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 22 Nov 00:25

While the board's main-red freeze holds, the plugin shall add only pull requests whose title or branch match its pattern, with a jump, and shall end it on the first completed, not cancelled push run of `CI` on `main` created after it began if that run passed.

## Examples

- Given a freeze for `HAL-2`,
  when a pass runs,
  then only #2 is enqueued, with a jump.
- Given a green push run after the freeze began,
  when a pass runs,
  then the freeze ends; a pattern that doesn't compile lets nothing in.
- Given a red push run after the freeze began, or a newer cancelled one,
  when a pass runs,
  then the freeze holds.
