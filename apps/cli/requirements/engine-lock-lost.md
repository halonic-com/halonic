# cli.engine-lock-lost

- Status: active
- Since: unreleased
- Source: HAL-16337

When the CLI's engine loses the workspace's engine lock (`cli.local-engine-lock`), because the command was paused for longer than the lock's limit, such as while the computer slept, the command that opened it (`run`, `runs send`, `routines watch`, `serve`) shall stop at once with a `conflict` error: "The engine stopped: this command was paused too long, such as while the computer slept, and lost its hold on this workspace." and the fix "Run the command again." A lock renewal that only failed shall still count as the scheduler's errors do, so three in a row stop the command.

## Examples

- Given `halonic routines watch` on a workspace,
  when another process takes the engine lock over while the watch is paused,
  then the watch ends with exit 5, saying "The engine stopped: this command was paused too long, such as while the computer slept, and lost its hold on this workspace." and "Run the command again."
- Given a command whose engine lock renewal fails twice,
  when it renews the lock,
  then the command goes on.
