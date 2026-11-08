# Workflows are a statecharts subset

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Workflows must be easy to read, to draw and to check before they run. A full
statecharts system, with nested states and parallel regions, is hard to explain
and hard to implement the same way twice.

## Decision

A workflow is a small subset of statecharts. It has six kinds of state: `task`,
`wait`, `final`, `workflow` (a subflow), `parallel` and `foreach`. States are
joined by ordered transitions with guards. There are no nested states.

The rules that decide what happens next are pure functions in
`@halonicjs/workflow`. The engine is an event-sourced decider: `advance(state,
input)` returns the new events and the effects to carry out, and does nothing
else. The exact rules are in the
[workflow semantics spec](../specs/workflow-semantics.md).

Shared workflow tests check the rules, so any engine that runs them stays in step
with the spec.

## Consequences

- A change to a rule is a change to the spec, the pure functions and the shared
  tests, in the same pull request.
- The engine keeps no timers and no long-lived memory. It advances one step per
  call, and a timer or a web request only asks for the next call.
- Each state type is its own folder in the engine, named as in the file format.

## Changed from an earlier decision

- The old record listed only the task, wait and final states. Subflows,
  parallel and for-each were added later and described only in the semantics
  section. This record lists all six.
- The old record named a second engine, written in Rust, as a goal. The new
  repository builds one engine, in TypeScript. The spec stays free of any
  language, so a second engine remains possible.
