# Decision: srt reports refused network requests, and sandbox-srt passes them on

- Approval: HAL-12648 (studio-claims 4.7, team decision on HAL-12643). Liam approves this note in review of this PR.
- Kind: internal

## What changes

- The sandbox-runtime 0.0.82 patch adds `--report-fd <fd>` to srt's command line (approved in the
  pull request before this one): srt writes the violation line of each network request its proxy
  refused to that descriptor, and puts `/dev/null` in its slot for the program.
- `tooling/check/patches-allowed.json`: the srt entry's `next-sha256` becomes its `sha256`.
- sandbox-srt's runner asks for the reports on every program it starts (not on the fence probe),
  reads them outside the fence and the session passes each one to `onBlocked` as a `network` block.
  The engine already turns those into `sandbox.blocked` events, which the run page shows as
  Blocked sites.

## Why

srt never reported network blocks, so the Blocked sites panel never showed for Claude Code and
Codex runs (studio-claims 4.7). Only srt's proxy knows the name a program asked for, and srt's
command line kept its refusals to itself. A connection the fence stops below the proxy (straight at
an address on Windows) is still refused, but not reported.

## Covers

- tooling/check/
