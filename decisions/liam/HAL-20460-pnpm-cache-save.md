# Decision: save the pnpm store only from pushes to main

- Approval: the task asks for this change (HAL-20460, from the security review on HAL-20445); Liam
  wrote it, so Julian reviews and signs this note
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:M9caQXb5dJwED4pdI5yGqyU1KVrTbQVO8cMb3+86vRHPOmk2bl5o+5sBGM2vllrmUM9cHfRa2NG8COC4UaVyCw==

## What changes

`.github/actions/setup` saves the pnpm store only on a `push` run on `main`. A run on `main` started
by hand or by the schedule still restores it, but no longer saves it. `studio-preview.yml` refuses a
`build-ref`, and `network-capture.yml` a `windows_ref`, that isn't on the ref the workflow runs on,
and `studio-preview.yml` reuses installers only from a push build of `main`.
To build an unmerged commit, start the workflow on its own branch (`--ref <branch>`). The nightly
click test names main's newest commit and runs on `main`, so it is unchanged. No requirement, test
or guard rule changes.

## Why

A run on `main` has `main`'s cache scope, which later `main` and release builds read. Only commits
already on `main` should be installed in that scope.

## Covers

- .github/
