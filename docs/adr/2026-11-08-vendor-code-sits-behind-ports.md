# Vendor code sits behind ports

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Halonic talks to model providers, file systems, keychains, schedulers, cloud
storage and more. If the core called these directly, it could run in only one
place, couldn't be tested without the real service, and would depend on every
library involved.

## Decision

Everything vendor-specific is an adapter behind a port. A port is a TypeScript
interface in `@halonicjs/ports`, one file per port. Code that talks to the outside
world lives in `packages/adapters/*`, and only there may it use an outside
library, only the ones approved for that package.

The layers decide who may import whom:

| Layer | May use | Never |
| --- | --- | --- |
| core | core packages listed before it; Zod in `schema-kit` and `format` only, `yaml` in `yaml` only | other third-party code, Node APIs, browser APIs |
| adapters | core, Node or browser APIs, their approved libraries | Studio packages |
| host | core, adapters, Node APIs | Studio packages |
| studio | core, React, Tauri, Vite | adapters (only `studio/services` may) |

The full table is in the repository's `AGENTS.md`. Three things enforce it: the
core's TypeScript settings load no Node or browser types, `pnpm check` reads
every import and dependency, and each package's `exports` expose only its public
entry points.

Each port file carries a version. A breaking change bumps it and comes with a
new record. Every port has a contract test suite in `packages/testing`, and every
adapter for that port must pass it.

The core needs a few things every program needs: results, ids, a clock, text
helpers. They come from the in-house `@halonicjs/std`, which replaces generic
helper libraries, so the core's only third-party code is the two approved
exceptions above. Randomness for ids and the clock come in through ports, so core
code stays deterministic in tests.

## Consequences

- Swapping a vendor, or adding a second one, touches one adapter.
- The core runs anywhere: a desktop app, a browser, a Node server, a Worker.
- A new outside library needs an entry in the dependency list and an approval.
  See [dependencies](../guides/dependencies.md).

## Changed from an earlier decision

- The old `Runtime` and `RunHost` ports overlapped. There is now one
  `RunExecutor` port with a local and a remote implementation, chosen once at
  start-up instead of by an `if` in five places.
- New ports cover scheduling, coordination (leases and counters), outbound HTTP
  and password hashing, so the same core can run on a Node server or a Cloudflare
  Worker.
- Adapters register themselves, and the CLI and the Studio use the same
  generated list. It used to be written out twice.
- Model providers and other integrations are kept outside the core and the
  adapters' own packages, behind the same ports.
