# Decision: `pnpm decision sign` replaces the signer's own stale line

- Task: HAL-16390
- Approval: a trust-root change written by Liam; Mateo checks it on HAL-16390, then Julian and Liam sign as the two guardians
- Kind: internal

## What changes

`pnpm decision sign` used to refuse any note that already had a line from the signer's key. Now it checks that line against the pull request's current head first. If it no longer matches (a rebase changed a covered file), the tool prints the new line and says it replaces the old one. A line that still matches is still refused, and a third line from another key is still refused. The guard's verification of notes doesn't change: the same key, the same signed text, the same number of lines.

## Why

On #5195 (HAL-16319) a rebase broke a signature, and the author had to push once just to remove the old line before the signer could run the tool again. The signer replacing their own line gives them no power they didn't have.

## Covers

- tooling/check/
