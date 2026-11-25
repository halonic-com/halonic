# action-steppers.stepper-preview-server-session

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, section 7.3; review of #5866 on task HAL-17517

When a validated stepper request with a `server-session` block is previewed, the action-steppers package shall show that block's steps and its "Done when" under "Instructions from <requester>, not checked by Halonic", apart from Halonic's own line naming the task.

## Examples

- Given a `server-session` block for the invented task `HAL-1234` with two steps,
  when it is previewed,
  then its lines say it opens Claude Code on the server for `HAL-1234`, and the two steps and "Done when: …" sit under the requester's heading.
