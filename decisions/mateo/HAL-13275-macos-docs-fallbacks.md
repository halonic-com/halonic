# Decision: the manual macOS docs check follows the install page's fallback steps

- Task: HAL-13275
- Approval: Liam approves this note in review of PR #3904
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Fr9YdI5JHcMcwGH5K4hOqA0ppXOmmkPmAsbAc8xI8vGXVvrN2ok9Yu6KdofvrtaeYFwtu3M4dIsRMz0Ht/ERBw==

## What changes

`.github/workflows/docs-install-check-macos.yml`, which runs only by hand (`workflow_dispatch`),
now does what a reader does when a check on the install page fails: it installs Node.js 26 with
nvm and pnpm with its curl line, opens a new terminal, and times each of those steps. Every step
runs in a new login zsh with an empty home folder. Step 2 now fails below Node.js 26.12. It adds
no new secret or write permission and does not touch any other workflow.

## Why

The first run passed step 2 on Node.js 24 and stopped at the missing pnpm, so it never checked
the page's own fallback steps. Those are the steps a reader on a new Mac needs.

## Tests

No test was weakened or skipped. Tested with a run of the branch (run 44483422251).

## Covers

- .github/
