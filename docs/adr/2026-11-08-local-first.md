# Local first

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Halonic works with files, models and credentials that belong to the person or
team using it. If a feature needs a cloud service to work, those people have to
trust that service before they can try anything.

## Decision

Local first is the main goal. Every feature works offline with a local model
before it gets a cloud option. A new workspace starts with
`privacy.localOnly: true`, so nothing leaves the computer until the user turns
that off.

## Consequences

- A cloud model, a cloud connector or a cloud deployment is always an addition
  to a feature that already works locally, never a requirement for it.
- A workspace with `privacy.localOnly: true` can't be deployed to a cloud
  target. `halonic validate --deployment` and `halonic deploy` refuse it and say
  how to fix it.
- Reviewers ask of every feature: does it work offline with a local model?

## Changed from an earlier decision

The decision is the same. The new repository adds deployment targets (a Node
server and a Cloudflare Worker), so the rule now also says what happens to a
local-only workspace when someone tries to deploy it.
