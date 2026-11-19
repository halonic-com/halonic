# Decision: srt reports refused network requests, and sandbox-srt passes them on

- Approval: HAL-12648 (studio-claims 4.7, team decision on HAL-12643). Liam approves this note in review of this PR.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DEO1nlC5Y3PO/3waQszBrj0DHyK/2MgHCThEAdmMcoOujSATbzl16bKeo8YJEbGwUhQ2QtKekxSXdk/XdE5kCA==

## What changes

- The sandbox-runtime 0.0.82 patch adds `--report-fd <fd>` to srt's command line (approved in the
  pull request before this one): srt writes the violation line of each network request its proxy
  refused to that descriptor. On Linux and macOS srt puts `/dev/null` in its slot for the program.
  On Windows srt's inheritable pipe handle reaches the program, unnamed, so a program that guesses
  its value can write to the pipe (it gains no network that way).
- `tooling/check/patches-allowed.json`: the srt entry's `next-sha256` becomes its `sha256`.
- sandbox-srt's runner asks for the reports on every program it starts (not on the fence probe),
  reads them outside the fence and the session passes each one to `onBlocked` as a `network` block.
  The engine already turns those into `sandbox.blocked` events, which the run page shows as
  Blocked sites.
- Because of Windows, the runner treats every report line as untrusted. It splits the pipe into
  lines of at most 1 KiB and drops a longer one without holding it, so a line with no line feed
  can't grow the host's memory or stop the reports after it. A line makes a block only when its
  host is one srt itself would accept (at most 255 characters, an IP address or DNS-name
  characters, no zone id) and its port is from 1 to 65535. A forged line can at most add a made-up
  site to Blocked sites.
- A listener that throws is logged through the session's `warn` and the other listeners still hear
  the block: a network block arrives from a pipe event no caller awaits, so a throw there would end
  the host.

## Why

srt never reported network blocks, so the Blocked sites panel never showed for Claude Code and
Codex runs (studio-claims 4.7). Only srt's proxy knows the name a program asked for, and srt's
command line kept its refusals to itself. A connection the fence stops below the proxy (straight at
an address on Windows) is still refused, but not reported.

## Covers

- tooling/check/
