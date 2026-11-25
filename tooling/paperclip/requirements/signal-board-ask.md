# paperclip.signal-board-ask

- Status: active
- Since: unreleased
- Source: HAL-18196 (plan HAL-17450 rev 5, "Step 2"; split from HAL-17980)

The `board-ask` signal rule shall work out the board check's ask actions from a compact JSON input (time only from `now`, the settings, the Board Checker's task and agent, the Merger's agent, the comment ids already handled and the pass's comments) and give the same actions as `paperclip.board-check-asks`: the new asks, oldest first, with ids and times only, for the `board-asks` document, then one wake of the Board Checker's task with reason `board_check_ask` and key `board-check ask <first comment id>`. A comment counts as an ask only when an agent wrote it within `windowMinutes` (default 12) and it matches the board check's pattern, and never when the board, the plugin, the Board Checker, a Paperclip receipt or the Merger on its request task wrote it. With `wake` off (default on), it shall list the asks without the wake. No action shall carry a comment's text.

## Examples

- Given each ask fixture of the board check (one ask, a card that is up, two asks, the comments that never count, the Merger's request and its ask on another task, a comment dated after `now`), when the board check and the rule decide, then their asks and wakes are equal.
- Given an ask already handled, when the rule decides, then it gives no action.
- Given `wake: false`, when an ask is new, then the rule lists it and wakes nobody; given `windowMinutes: 45`, an ask from 30 minutes ago counts.
