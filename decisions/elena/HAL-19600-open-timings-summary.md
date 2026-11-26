# Decision: the Windows installer job reports Studio's open timings in its job summary

- Task: HAL-19600
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19531 (the plan as Liam adjusted it on 26 Nov: a Windows CI job that reports the open timings as a job summary, failing only past a 10 s open); Liam signs this note in review
- Kind: internal

Opening a recent workspace right after Studio starts takes about 20 s on Windows (HAL-19531). Since #6514 the shell writes how long each start and open step took to `studio/shell.log`, under the source `timings`.

## What changes

- In `.github/workflows/ci.yml`, the `installer-windows` job gets one step after the silent install, "Studio's open timings". It runs `tooling/open-timings/measure-open.ps1` with the installed folder. The script:
  - starts the installed Studio with a test profile in `RUNNER_TEMP`
  - lets Studio reopen a copy of `examples/acme`, then closes it
  - writes the `timings` lines to the job summary as a table of step and ms
- The step fails only when opening takes longer than 10 s, when the engine is refused, or when no engine answers.
- The installer filter in the `changes` job also matches `tooling/open-timings/`, so a change to the script runs the job.
- No new permission, secret, token or network host is involved.
- The WebView2 DevTools port is opened only for the first start, through the current user's policy key (as `test-update.ps1` does), and the key's value is removed again.

## Why

- **One build, not two.** The installer job already builds and installs Studio on `windows-2025`, so the step adds about 2 minutes instead of a second Windows build.
- **Not a tight gate.** Shared runners have no Halonic WSL distro and their timings vary. A tight gate would be flaky; 10 s catches the big regressions.

## Covers

- .github/
