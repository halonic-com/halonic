# Decision: sandboxed commands start srt-win hidden, and the process-starts rule asks for windowsHide

- Task: HAL-13197
- Approval: Liam approves this note in his security review of the srt patch change on HAL-13197 (https://paperclip.halonic.com/HAL/issues/HAL-13197). The board found the bug in the first preview build (HAL-11719).
- Kind: user-visible

## What changes

1. The `@anthropic-ai/sandbox-runtime@0.0.82` patch adds `windowsHide: true` to
   the spawn with which srt's CLI starts `srt-win`. Its hash moves from
   `next-sha256`, approved in pull request 3902, to `sha256` in
   `tooling/check/patches-allowed.json`. No sandbox rule, file or network
   policy changes.
2. The `process-starts` rule now also fails a shipped file, listed in
   `tooling/check/process-starters.json`, that starts a program through
   `child_process` without `windowsHide: true` in an options object literal.
   Build and CI scripts in a `scripts/` folder are exempt: they run in a
   terminal. The rule only gets stricter; no entry is added or removed.

## Why

On Windows the agent host runs without a console, so a console program it
starts without `windowsHide` gets a console window of its own. Every
sandboxed command an agent ran opened one that closed at once (HAL-13197).
The rule makes sure a new spawn can't bring the window back; the Rust shell
has the same guard in clippy (pull request 3888).

## Covers

- tooling/check/
