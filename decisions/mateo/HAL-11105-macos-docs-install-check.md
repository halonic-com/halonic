# Decision: add a manual macOS workflow that runs the documented install steps

- Task: HAL-11105
- Approval: Liam approves this note in review of PR #3174
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WLgyYzj9j6u1LXwQfpcOQaEjTfMChKhbgMheXUWroU0ilTHC1sbnF1NQI4eyslDFuM7zSHg+GgD6WZc7gePVBg==

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
