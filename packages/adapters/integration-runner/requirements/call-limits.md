# integration-runner.call-limits

- Status: active
- Since: 0.1.0
- Source: HAL-4281 (HAL-983, design HAL-958 section 3.7, attack cases A19, A21, A37)

While the runner runs, Halonic's side of the bridge shall cancel a call whose signal aborts or that runs past its time limit and stop the runner when a cancelled call doesn't answer within 5 seconds, ping the runner every 5 seconds between calls and stop it when it doesn't answer within 1 second, stop it after 2 minutes without a call, keep at most 1 MiB of stderr per call, and pass tool results, tool errors and stderr through the kit's secret filter.

## Examples

- Given a call whose signal aborts,
  when the runner doesn't answer within the grace,
  then the call fails at once and the runner is stopped with the reason `call-deadline`.
- Given a runner busy in a loop between calls,
  when it misses a pong,
  then it is stopped with the reason `unresponsive`.
- Given a runner with no call for 2 minutes,
  then it is stopped with the reason `idle`.
- Given a tool result that holds a secret value,
  when it reaches Halonic,
  then the value is replaced with `[secret removed]`.
