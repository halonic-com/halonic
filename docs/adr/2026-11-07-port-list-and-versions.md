# The phase 1 port list and port versions

- Status: accepted
- Date: 2026-11-07
- Owner: Liam
- Source: HAL-112; plan 4.2, 4.3, 4.4; multi-cloud ADR sections 5.3 and 8

## Context

Core logic depends on ports, and adapters implement them. The old repo had
one `ports` file with 4 contract suites, a `FetchLike` type, and two ports
that overlapped (`Runtime` and `RunHost`). The multi-cloud ADR adds ports
for timers, coordination, outbound HTTP and password hashing, and requires
that every port works on Node, on Workers and in the browser.

Phase 3 writes adapters against these ports, so the list has to be settled
before then.

## Decision

**One file per port in `packages/core/ports/src`, each with a version
constant.** All start at version 1. `portVersions` lists them in code and
the package README lists them in a table. A test fails when the files, the
list and the table disagree.

**Ports name only Web-standard types** (`Request`, `Response`,
`AbortSignal`, `RequestInit`, `Uint8Array`), through the core TypeScript
preset. Times that adapters store are ISO text, and durations are
milliseconds as numbers, so every runtime can keep them as they are.

| Port                                                                      | From the old repo                                                                                                                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DefinitionStore`                                                         | same methods. New read-only side, `DefinitionSource`, which is all a cloud deployment hands out (multi-cloud ADR 5.5)                                                                        |
| `RunStore`                                                                | `append(event)` becomes `append(runId, expectedSeq, events)` and returns a conflict instead of letting two writers both win. `events` takes `afterSeq`, for streaming from a sequence number |
| `RecordStore`, `BlobStore`, `Vcs`, `Clock`, `IdGenerator`, `LlmCache`     | unchanged                                                                                                                                                                                    |
| `Secrets`                                                                 | read-only: the optional `set` is gone                                                                                                                                                        |
| `TokenStore`                                                              | new: what the server writes itself (refresh tokens), split out of `Secrets`                                                                                                                  |
| `LlmProvider`, `KnowledgeProvider`, `ConnectorClient` and their factories | unchanged, except that factories get an `HttpClient` instead of `fetch`. Knowledge factories get the read-only `DefinitionSource`. Connector factories also get the `TokenStore`             |
| `HttpClient`                                                              | new, replaces `FetchLike`. Same signature as the Web `fetch`                                                                                                                                 |
| `RunExecutor`                                                             | new, replaces `Runtime` and `RunHost` (plan 4.2): `start`, `startAgent`, `send`, `subscribe` (events after a sequence number) and `chatTurn`                                                 |
| `Scheduler`                                                               | new: `schedule`, `cancel` and `pending` timers per key. The adapter calls a `SchedulerListener` with due timers and the routine tick. Timers may arrive late or twice                        |
| `Coordination`                                                            | new: leases (`tryAcquire`, `renew`, `release`), `read` and `compareAndSet` values, `increment` with a limit, and `countInWindow` for login limits                                            |
| `PasswordHasher`                                                          | new: `hash`, `verify`, `needsRehash`                                                                                                                                                         |

**Left out of the ports on purpose:**

- `RunHost.runRoutine`, `blockedRoutines` and `deployment` are host status
  and routine control. They become typed commands of the host RPC in phase
  4. The routine scheduler service in `core/app` starts routine runs through
  `RunExecutor.start` with a trigger.
- `RunHost.connectorTools` and `callConnectorTool` (connector tools for the
  chat panel, outside a run) wait for the `ConnectorReadService` and the
  outside-run gate of proposal 3. They come back as a new port then.
- The three optional run log fields of proposal 1 (`tool.result.outcome`,
  `run.failed.reason`, `approval.resolved.by`) are phase 2 and not in
  `@halonicjs/events` yet.

## The freeze

From phase 3 the ports are frozen. A change may add an optional field, an
optional method or a new port, and keeps the version. Anything else is
breaking: it bumps the port's version, comes with a new ADR, and updates the
contract suite and every adapter in the same change.

## Consequences

- Adapters for Node and Cloudflare implement the same interfaces, and a
  contract suite can run unchanged in Node and `workerd`.
- The engine (phase 2) uses `RunStore.append` with a sequence check and the
  `Scheduler` for every wait, so it needs no timers of its own.
- `RunExecutor.start` and `send` return once the input is recorded, so
  callers follow progress through `subscribe` instead of polling.
