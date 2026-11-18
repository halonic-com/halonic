# Decision: allow the srt patch that reports refused network requests

- Approval: HAL-12648 (studio-claims 4.7, team decision on HAL-12643). Liam approves this note in review of this PR.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KmBO68i+m3E1LUY+q5qTNHk/RfsMbYXj1wisTvXPY2RblM/SCrk/TtTcMxZkicwyR4ppLu87wqDtrZSVcVOyBA==

## What changes

- `tooling/check/patches-allowed.json`: the sandbox-runtime 0.0.82 entry gets a `next-sha256`, the
  hash of the patch the next pull request brings, and its `reason` and `remove-when` name the new part.
- The new part adds `--report-fd <fd>` to srt's command line. srt writes the violation line of each
  network request its proxy refused (`deny network-outbound host:port (reason)`) to that inherited
  descriptor. On Linux and macOS the program never gets it: srt puts `/dev/null` in its slot, as it
  does for `--control-fd`. On Windows srt's inheritable pipe handle reaches the program, unnamed, so
  a program that guesses its value can write to the pipe. That gives it no network, but it could
  forge report lines, so sandbox-srt treats every line as untrusted (bounded lines, only hosts and
  ports srt itself would accept; see the next pull request's note). A fd that can't be opened stops
  srt before anything starts, and a reader that goes away loses reports, never the run: the proxy
  refuses the request either way.

## Why

srt never reports network blocks today, only refused writes, so the run page's Blocked sites panel
never shows for Claude Code and Codex runs (studio-claims 4.7). srt's proxy already records every
refusal in its violation store, but its command line doesn't show the store, and sandbox-srt runs
one srt command line per program. The patch is the smallest way out: about 60 lines in `cli.js`, no
change to how srt decides. The alternatives were worse: parsing srt's `--debug` output from the
program's own error stream (the program could forge lines, and the debug noise reaches the
program's output), or running our own filtering proxy.

## Covers

- tooling/check/
