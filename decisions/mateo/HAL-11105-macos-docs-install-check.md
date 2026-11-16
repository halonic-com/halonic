# Decision: add a manual macOS workflow that runs the documented install steps

- Task: HAL-11105
- Approval: Liam approves this note in review of PR #3174
- Kind: internal

## What changes

A new workflow, `.github/workflows/docs-install-check-macos.yml`, runs only by hand
(`workflow_dispatch`). It follows the documented install steps on a macOS runner and times each
one. It adds no new secret or write permission and does not touch any existing workflow.

## Why

We need to know whether the install steps in the docs work on macOS and how long each takes.
A manual workflow answers that without adding cost or risk to the checks on every pull request.

## Tests

No test was weakened or skipped.

## Covers

- .github/
