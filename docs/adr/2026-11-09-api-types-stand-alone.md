# API types stand alone: types packages never depend on the engine

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Studio, the CLI, integrations and outside programs all need Halonic's types to
talk to it: the ports, the events a run writes and, later, the requests and
answers of an API. If those types sit in a package that also pulls in the
engine (`workflow`, `routines`, `workspace`, `app`), an adapter or a library,
every caller gets all of that too. Docker keeps its API types and client in
their own small modules for this reason.

The layer table already keeps adapters, the host and Studio out of core. Inside
core, `coreOrder` happens to place `events` and `ports` before the engine. That
only holds while nobody reorders the list, and it still lets them use Zod
through `schema-kit`.

## Decision

The API types packages are `@halonicjs/events` and `@halonicjs/ports`. They
are listed under `apiTypes` in `tooling/check/policy.json`.

An API types package:

- is a core package;
- uses only other API types packages, never another core package such as
  `std`, `schema-kit` or the engine;
- uses no third-party code, not even a core exception such as Zod.

Its tests may still use test tooling. A new package of types or a client for
outside callers, for example a future API client, joins the list and follows
the same rule. The integration kit's published entry,
`@halonicjs/integration-kit`, only re-exports `ports` and its own files. Its
`entry.test.ts` already holds it to that.

## Consequences

- Studio, the CLI and outside callers can use the types without the engine,
  and a published types package has no dependencies.
- `pnpm check` keeps the rule: the `layers` rule reports any dependency or
  import of an API types package that is not another API types package, and
  the `packages` rule reports an `apiTypes` entry that is not a core package.
- A type an API types package needs from elsewhere moves into an API types
  package. Checking values at run time (with Zod) stays in `schema-kit` and
  `format`, which import the types, not the other way round.
