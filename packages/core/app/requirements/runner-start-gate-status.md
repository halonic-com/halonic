# app.runner-start-gate-status

- Status: active
- Since: unreleased
- Source: HAL-3384; Liam's plan approval on HAL-12520; the "Runs" line design on HAL-1873, section 11

The start gate shall answer the status a start would decide now, from the same fenced sandbox, fence status and saved yes as a start, without starting anything, so the trust check and every start agree on the reason. Like `UnfencedRuns`, reading the status shall remove a saved yes once the computer is in the sandbox. The gate shall save the user's yes only for the reason code runs without the sandbox at that moment, and shall save nothing for any other reason or when the computer is in the sandbox.

## Examples

- Given the status `not-fenced` for `container`,
  when the status is asked,
  then the answer is `needs-yes` for `container` and nothing starts.
- Given Windows, where the sandbox check passes,
  when the status is asked,
  then the answer is `needs-yes` for `windows`.
- Given a saved yes and a computer in the sandbox,
  when the status is asked,
  then the answer is `fenced` and the saved yes is gone.
- Given the status `not-fenced` for `container`,
  when the user's yes for `container` is given,
  then it is saved and the next start runs in the launcher's sandbox.
- Given the status `not-fenced` for `container`,
  when the user's yes for `bubblewrap-missing` is given,
  then nothing is saved.
