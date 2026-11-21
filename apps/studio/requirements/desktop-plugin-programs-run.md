# studio.desktop-plugin-programs-run

- Status: active
- Since: unreleased
- Source: HAL-3384; the "Runs" line design section 6 (HAL-1873); Ravi on HAL-14865; feeds plugins.plugin-trust-program-rows

Where the computer runs macOS or Linux, the desktop app shall tell a plugin's trust check whether the plugins' programs can run on this computer, from the agent host's sandbox check, read each time the check opens: ready when the check passes, and the sandbox can't start when it fails. On Windows, where the agent host's check isn't the one `halonic run` makes for plugin programs, the app shall not say, so the Programs rows keep the line that holds either way. When the agent host can't answer, the app shall not say either.

## Examples

- Given Studio on Linux, where the agent host's sandbox check passes,
  when the trust check opens,
  then the app says the programs can run.
- Given Studio on macOS, where the check fails because the sandbox can't start,
  when the trust check opens,
  then the app says the programs can't start here.
- Given Studio on Windows,
  then the app doesn't say whether the programs can run, and doesn't ask the agent host.
