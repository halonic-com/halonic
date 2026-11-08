# Testable by design

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Halonic runs agents that call models, which give different answers each time and
cost money. A workflow that can only be tested against a real model is not
tested.

## Decision

Each thing we ship can be tested without outside services, and each kind of test
has one place:

- **Workflow tests** are `*.test.yaml` files that run a workflow with a scripted
  model from `packages/testing`.
- **Contract suites**, one per port, run against every adapter for that port.
- **Record and replay** captures a real provider's answers once and replays them,
  so a test of a real provider's behaviour doesn't need the provider.
- **Requirement tests** name the requirement they prove. A requirement is one
  recorded rule of behaviour with a stable ID.

Tests get their clock, their files and their outbound HTTP passed in.

## Consequences

- A bug fix starts with a test that fails before the fix.
- Weakening or deleting a test, or changing a requirement, needs an approved
  decision note.
- A new port brings its contract suite with it.

## Changed from an earlier decision

Contract suites cover every port, about 12, instead of 4. Requirements and tests
are linked by ID and checked, and there are contract tests for each deployment
target.
