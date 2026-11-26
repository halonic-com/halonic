# Decision: connector-paste-token quotes a local integration's Secrets line

- Task: HAL-19897
- Approval: HAL-19897, from Julian's security sign-off on #6564 (HAL-19672); the line's words from Noah's copy check (HAL-19673); the reviewer approves this note in review
- Kind: internal

## What changes

`library.connector-paste-token` gave a local integration the Secrets section "of
`library.connector-secrets`", whose line says the connector "gives it to the program it starts".
Since #6564 a local integration's line says instead that it "sends it only to the sites it says it
connects to", because a local integration starts no program. The requirement now quotes that line,
and its first example names it.

## Why

The page and its test already show the integration's line; only the requirement still pointed at
the other one. The wording follows the code, so nothing a user sees changes.

## Tests

No test was skipped, weakened or deleted. `src/ui/connector-paste-token.test.tsx` already checks
the integration's line under `verifies("library.connector-paste-token")`.

## Covers

- library.connector-paste-token
