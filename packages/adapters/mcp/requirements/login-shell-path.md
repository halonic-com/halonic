# mcp.login-shell-path

- Status: active
- Since: 0.1.0
- Source: HAL-230 and HAL-2544 (a desktop app on macOS inherits a short `PATH`; my launcher plan of 10 Nov on HAL-230, which Liam approved)

When the pinned launcher looks for runners on macOS, where a desktop app inherits a short `PATH`, it shall read the `PATH` of the person's login shell: `$SHELL -l -c` with a fixed script that prints only `PATH` between markers, in the home folder, with the app's own environment and a five-second limit, at most once per search it keeps. It shall take only the text between the markers. It shall give no `PATH`, and start nothing, when `SHELL` or `HOME` isn't an absolute path or the shell is under a skill's `scripts/` folder, and give no `PATH` when the shell fails or takes too long, stopping only the shell, so the launcher still looks in the app's `PATH` and the usual install folders.

## Examples

- Given a login shell whose profile prints a greeting and whose `PATH` is `/acme/login/bin:/usr/bin`,
  when its `PATH` is read,
  then it is `/acme/login/bin:/usr/bin`.
- Given `SHELL` under `skills/acme/scripts/`,
  when its `PATH` is read,
  then there is none, and the shell never ran.
