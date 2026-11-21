# agent-host.plugin-run-state

- Status: active
- Since: unreleased
- Source: HAL-15113; the plugin page's R15 in the "Runs" line design on HAL-1873, section 10 (`rl-page-stopped`, A23), approved by the board on HAL-1949; the start's outcome comes from `cli.plugin-backend-start-told`

When a start of a plugin's runner stops because its fence proof failed though the computer passed the sandbox check, the agent host shall keep that plugin's id and the time, in memory only, until a later start of that plugin runs (in the sandbox or with the yes), until **Check again** forgets it, or until the host stops; a start that needs a yes shall leave it as it is. When Studio asks for a plugin's run state by its id, the agent host shall answer `{ stopped: true, stoppedAt }` or `{ stopped: false }`, as codes only, and `stopped: false` for any valid id it holds no stop for, reading no disk. When Studio asks it to check again, it shall forget that plugin's stop only. Neither route shall start anything or change what the start gate decides. The agent host shall serve both only behind the launch token, with a strict body that names one plugin id of the allow-list; it shall answer 401 without the token and 400 for any other body, and change nothing then. It shall keep at most 64 stops, dropping the oldest.

## Examples

- Given `weather`'s runner whose fence proof failed at its start,
  when Studio asks for `weather`'s run state,
  then the answer is `{ stopped: true, stoppedAt }`.
- Given that stop, when a later start of `weather` runs in the sandbox,
  then the answer is `{ stopped: false }`.
- Given that stop, when the person presses **Check again** for `weather`,
  then `weather`'s stop is gone and another plugin's stop stays.
- Given a request without the launch token or with a wrong one,
  when it reaches either route,
  then the answer is 401 and nothing changes.
- Given a body with a path, a device name, an upper-case id, an extra field or no id,
  when it reaches either route,
  then the answer is 400 and nothing changes.
