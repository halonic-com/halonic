# WSL 2 release check

Halonic offers WSL 2 in v0.1 as a Linux host ([HAL-770](/HAL/issues/HAL-770)).
The automated suites run on Linux, macOS and Windows runners, but none of them
runs WSL 2 with the workspace on a Windows drive. This check closes that gap.
It is a condition for the sign-off in [HAL-196](/HAL/issues/HAL-196).

## What it proves

With srt on and the harness's own sandbox off:

1. A private file on `/mnt/c` can't be read inside srt.
2. Windows programs started from WSL (`cmd.exe`, `powershell.exe`, `curl.exe`;
   "interop") can't read that file or reach a blocked site inside srt.

If 2 fails, the start-up check on WSL 2 must report the sandbox as unavailable
until interop is off, and the release waits for that change.

## How to run it

On a Windows machine, in a WSL 2 distro, with srt installed:

```sh
packages/adapters/sandbox-srt/manual/wsl2-release-check.sh
```

The script makes a marker file in the `Users/Public` folder of the C: drive, runs each probe once
outside srt (the control) and once inside it, and removes the file. A probe
whose control doesn't show the leak is reported as inconclusive, never as a
pass. Exit code 0 is a pass, 1 a leak, 2 inconclusive.

Run it once with interop on (the WSL default) and once with `interop.enabled=false`
in `/etc/wsl.conf` (then `wsl --shutdown`). Paste the output below.

## Results

| Field               | Value |
| ------------------- | ----- |
| Date                |       |
| Run by              |       |
| Windows build       |       |
| WSL and kernel      |       |
| srt version         |       |
| Halonic commit      |       |
| Interop on: result  |       |
| Interop off: result |       |

Output, interop on:

```
(paste)
```

Output, interop off:

```
(paste)
```

## Decision

- [ ] All probes pass with interop on: no change to the start-up check.
- [ ] A probe leaks with interop on: the start-up check requires interop off
  (follow-up task: ______). The interop-off run must then pass.
- [ ] Inconclusive: fix the control and run again.
