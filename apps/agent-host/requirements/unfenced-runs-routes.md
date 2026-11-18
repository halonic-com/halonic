# agent-host.unfenced-runs-routes

- Status: active
- Since: unreleased
- Source: HAL-3384; Liam's plan approval on HAL-12520, with its conditions; the "Runs" line design on HAL-1873, sections 7 and 11, approved by the board on HAL-1949

When Studio asks whether plugin code may run without the sandbox, the agent host shall answer what a plugin start would decide at that moment, from its one start gate, as codes only: `fenced`, `allowed` with the reason and the date of the yes, `needs-yes` with the reason, or `stopped`. Reading the status shall remove a saved yes once the computer is in the sandbox, as a start does. When Studio passes on the user's yes for a reason, the agent host shall save it only through the start gate, and only when that reason is the current one; otherwise it shall save nothing and answer 409 `reason_changed`. When Studio takes the yes back, the agent host shall remove it and stop every plugin runner it started without the sandbox before it answers; if one or more didn't stop, it shall answer 500 `take_back_incomplete`, with the yes still gone. The agent host shall serve these routes only behind the launch token, with strict bodies, in every build, the shipped single executable too. If the saved yes can't be read, then the agent host shall answer `needs-yes` with the reason only and write the error's code, never its message or path, to its standard error.

## Examples

- Given a computer inside a container and no saved yes,
  when Studio asks for the status,
  then the answer is `needs-yes` for `container`.
- Given Windows, where the sandbox check passes,
  when Studio asks for the status,
  then the answer is `needs-yes` for `windows`.
- Given the status `not-fenced` for `container`,
  when Studio passes on a yes for `bubblewrap-missing`,
  then the answer is 409 `reason_changed` and nothing is saved.
- Given a body with an unknown reason or an extra field,
  when Studio passes it on,
  then the answer is 400 and nothing is saved.
- Given a plugin running without the sandbox,
  when Studio takes the yes back,
  then the plugin is stopped before the answer, and the yes is gone.
- Given a request without the launch token or with a wrong one,
  when it reaches any of the three routes,
  then the answer is 401 and nothing changes.
- Given the shipped single executable,
  when Studio asks for the status, gives the yes or takes it back,
  then it answers as the host does elsewhere, and still starts no plugin.
