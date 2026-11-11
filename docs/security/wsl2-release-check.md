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

Run on 10 Nov 2026, on the board's own PC, from `main` at
`25e673a`, unchanged and with no harness sandbox around it. Both runs passed.

| Field | Value |
| --- | --- |
| Date | 10 Nov 2026 |
| Run by | The board ([HAL-3743](/HAL/issues/HAL-3743)) |
| Windows build | Windows 11 Pro 10.0.26200 |
| WSL and kernel | 6.18.33.2-microsoft-standard-WSL2; fresh Ubuntu 26.04.1 LTS distro, systemd on, normal user |
| srt version | 0.0.82 (`@anthropic-ai/sandbox-runtime`), bubblewrap 0.11.1, socat, ripgrep from Ubuntu |
| Halonic commit | `25e673a` |
| Interop on: result | PASS (exit 0) |
| Interop off: result | PASS (exit 0) |

Output, interop on:

```
WSL: 6.18.33.2-microsoft-standard-WSL2
srt: 0.0.82
interop enabled: yes
drvfs mount: 9p rw,noatime,aname=drvfs;path=C:\;uid=0;gid=0;symlinkroot=/mnt/,cache=0x5,access=client,msize=65536,trans=fd,rfd=6,wfd=

== 1. private file on /mnt/c ==
1a cat from WSL: PASS (inside srt: cat: <C: drive>/<public folder>/halonic-wsl2-check.B2KmHg/private.txt: Permission denied )

== 2. Windows programs through interop ==
2a cmd.exe type: PASS (inside srt: <3>WSL (2 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1 )
2b powershell Get-Content: PASS (inside srt: <3>WSL (2 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1 )
2c curl.exe blocked site: PASS (inside srt: <3>WSL (2 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1 )
2d interop reachable inside srt: NO

RESULT: PASS
EXIT=0
```

Output, interop off:

```
WSL: 6.18.33.2-microsoft-standard-WSL2
srt: 0.0.82
interop enabled: no
drvfs mount: 9p rw,noatime,aname=drvfs;path=C:\;uid=0;gid=0;symlinkroot=/mnt/,cache=0x5,access=client,msize=65536,trans=fd,rfd=6,wfd=

== 1. private file on /mnt/c ==
1a cat from WSL: PASS (inside srt: cat: <C: drive>/<public folder>/halonic-wsl2-check.wUFoQP/private.txt: Permission denied )

== 2. Windows programs through interop ==
2 interop: SKIPPED, interop is off; the start-up check needs no change

RESULT: PASS
EXIT=0
```

Notes:

- In the output above, the `/mnt/c` prefix of the marker file path is shown as
  `<C: drive>` and the Public folder name as `<public folder>`. Nothing else in
  the output was changed.
- For the interop-off run, interop was turned off in that distro's
  `/etc/wsl.conf` and only that distro was restarted (`wsl --terminate Ubuntu`).
  `wsl.conf` was restored afterwards.
- The control runs outside srt did show the leak paths, so the passes are real,
  not skipped checks.
- A harmless message, "Failed to start the systemd user session", appeared on
  the first start of the fresh distro. It doesn't affect the check.

## Decision

- [x] All probes pass with interop on: no change to the start-up check.
- [ ] A probe leaks with interop on: the start-up check requires interop off.
- [ ] Inconclusive: fix the control and run again.

Why it passes: inside srt, Windows programs can't start at all (2d is NO).
Interop needs a vsock socket, and srt's sandbox refuses it (`UtilBindVsockAnyPort
... socket failed 1`, EPERM). So the result depends on srt blocking socket
creation. **Re-run this check whenever srt is upgraded**: a version that allows
vsock would change it. It was run on srt 0.0.82 only.
