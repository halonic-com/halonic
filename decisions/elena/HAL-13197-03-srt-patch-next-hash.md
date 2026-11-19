# Decision: approve the next srt patch, which starts srt-win hidden

- Task: HAL-13197
- Approval: Liam approves this note in his security review of the srt patch change on HAL-13197 (https://paperclip.halonic.com/HAL/issues/HAL-13197). The patch change itself is pull request 3895.
- Kind: internal

## What changes

`tooling/check/patches-allowed.json` gains a `next-sha256` for the
`@anthropic-ai/sandbox-runtime@0.0.82` patch, next to the hash of the patch in
use, and its reason names the new part. Nothing else changes: the patch in use
stays as it is until pull request 3895 moves the new hash to `sha256`.

The next patch adds one thing to the current one: srt's CLI starts `srt-win`
with `windowsHide: true`. It changes no sandbox rule, file or network policy;
it only stops Windows from giving `srt-win` a console window of its own.

## Why

On Windows the agent host runs without a console, so every sandboxed command
an agent ran opened a console window that closed at once (HAL-13197, found by
the board in the first preview build). The patch rule asks for a changed
patch's hash to be approved in its own pull request first, so this one does
only that.

## Covers

- tooling/check/
