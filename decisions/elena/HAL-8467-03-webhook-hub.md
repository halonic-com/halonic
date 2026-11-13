# Decision: a webhook routine at the root must name its hub

- Approval: the package owner (Liam) approves this in review of #2466 on HAL-8512
- Kind: internal
- Task: HAL-8467

## What changes

`workspace.routines` reports one more error: a webhook routine at the root
without `run.hub`, even when the root has agents or workflows of its own. Two
examples cover it. Every other check stays as it was.

## Why

A webhook address names a hub, and the webhook route finds a routine through
that hub. A root webhook routine with no `run.hub` could never be reached, so
the loader says so at `run.hub` instead of leaving a routine that silently
never runs.

No test was weakened.

## Covers

- workspace.routines
