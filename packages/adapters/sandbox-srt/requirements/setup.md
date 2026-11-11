# sandbox-srt.setup

- Status: active
- Since: 0.1.0
- Source: HAL-5074, HAL-1202

The sandbox-srt adapter shall set the sandbox up once for the installer: on Windows, run srt's install for the whole machine without srt's profile read grant, then check the sandbox, and say it is done only when the check passes, or else why not in one line (the administrator prompt cancelled, the install's own words, or what the check found missing). Running it again shall repair the install or change nothing. On other systems it shall install nothing and say there is no setup.

## Examples

- Given Windows where the install works,
  when the sandbox is set up, and set up again,
  then each time it is done and the check passes.
- Given Windows where the administrator prompt is cancelled,
  when the sandbox is set up,
  then it isn't done, and the reason says the prompt was cancelled.
- Given Linux,
  when the sandbox is set up,
  then nothing is installed and it isn't done.
