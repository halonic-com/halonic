# The phase 1 port list and port versions

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Core logic depends on ports, and adapters implement them. The old repo had
one `ports` file with 4 contract suites, a `FetchLike` type, and two ports
that overlapped (`Runtime` and `RunHost`). The multi-cloud design adds ports
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

| Port                                                                      | From the old repo                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DefinitionStore`                                                         | same methods. New read-only side, `DefinitionSource`, which is all a cloud deployment hands out. Every method refuses absolute paths, `..`, backslashes and NUL; the old repo checked only in the Node adapter                                                                                                                                                                                                           |
| `RunStore`                                                                | `append(event)` becomes `append(runId, expectedSeq, events, { snapshot })`: it returns a conflict instead of letting two writers both win, and stores the engine's state snapshot in the same write. New `snapshot(runId)`. `events` takes `afterSeq`. `list` filters by status, so the watchdog finds stuck runs, and may lag the log                                                                                   |
| `RecordStore`, `Clock`, `LlmCache`                                        | unchanged                                                                                                                                                                                                                                                                                                                                                                                                                |
| `BlobStore`                                                               | unchanged, except that `get` returns `null` for anything but a 64-character lowercase hex hash, without touching storage                                                                                                                                                                                                                                                                                                 |
| `Vcs`                                                                     | unchanged; the docs now say what the old git adapter did (`log` newest first, `pull` fast-forward only)                                                                                                                                                                                                                                                                                                                  |
| `IdGenerator`                                                             | unchanged; ids are unique but not secret                                                                                                                                                                                                                                                                                                                                                                                 |
| `Secrets`                                                                 | read-only: the optional `set` is gone. Names match `^[A-Za-z][A-Za-z0-9_-]*$`, at most 128 characters; stores that can't hold `-` map it to `_`, as the old environment adapter did                                                                                                                                                                                                                                      |
| `TokenStore`                                                              | new: what the server writes itself (refresh tokens), split out of `Secrets`. Same name rule                                                                                                                                                                                                                                                                                                                              |
| `LlmProvider`, `KnowledgeProvider`, `ConnectorClient` and their factories | unchanged, except that factories get an `HttpClient` instead of `fetch`, and an assistant turn carries an optional `replay`: the provider's own record of it (such as Anthropic's thinking blocks), which the engine stores and hands back unchanged. Knowledge factories get the read-only `DefinitionSource`. Connector factories also get the `TokenStore`                                                            |
| `HttpClient`                                                              | new, replaces `FetchLike`. Same signature as the Web `fetch`. An adapter that refuses addresses checks every redirect hop and the resolved address                                                                                                                                                                                                                                                                       |
| `RunExecutor`                                                             | new, replaces `Runtime` and `RunHost`: `start`, `startAgent`, `send`, `subscribe` and `chatTurn`. A start may carry its own `runId`, and repeating it returns the existing run, so routine fires, mails and signals start one run each. `subscribe` takes `onEvent` and `onClose(error?)`, so a client can tell a dropped stream from a quiet run. Subflows are internal to the executor, so the request has no `parent` |
| `Scheduler`                                                               | new: `schedule`, `cancel` and `pending` timers per key, and a `SchedulerFactory` that takes the `SchedulerListener`. Timers may arrive late or twice; `at` is the time the timer was set for. A timer set again during `onTimer` stays. A rejecting `onTimer` is retried with backoff from 1 second up to 15 minutes, never dropped                                                                                      |
| `Coordination`                                                            | new: leases (`tryAcquire`, `renew` keeping the token, `release`), `read` and `compareAndSet` values (`null` deletes), `increment` with a limit, and `countInWindow` for login limits. Keys up to 256 bytes; amounts are positive whole numbers, money in micro-units; bad input throws `RangeError`                                                                                                                      |
| `PasswordHasher`                                                          | new: `hash`, `verify`, `needsRehash`. Fixed format `$scrypt$ln=14,r=8,p=5$<salt>$<key>` over the NFC password, with a known-answer vector; `verify` throws on a malformed hash. The old server compared SHA-256 of a plain-text password                                                                                                                                                                                 |

**Left out of the ports on purpose:**

- `RunHost.runRoutine`, `blockedRoutines` and `deployment` are host status
  and routine control. They become typed commands of the host RPC in phase
  4. The routine scheduler service in `core/app` starts routine runs through
  `RunExecutor.start` or `startAgent`, each with a trigger, so a routine
  finds its own runs again whether it runs a workflow or one agent.
- `RunHost.connectorTools` and `callConnectorTool` (connector tools for the
  chat panel, outside a run) wait for the `ConnectorReadService` and the
  gate for tool calls outside a run. They come back as a new port then.
- Run log additions are phase 2 and not in `@halonicjs/events` yet. All of
  them are additive. They are:
  - three optional fields (`tool.result.outcome`,
    `run.failed.reason`, `approval.resolved.by`)
  - the definitions embedded in `run.started`, so a run keeps the
    definitions it started with
  - the "effect requested" record that marks an outcome as unknown after a
    crash
  - the blob hash reference for payloads over 256 KB
- A live-progress channel (tokens, "typing") and cancelling a run. The old
  Studio has neither, so there is no parity gap; both can come later as
  optional methods.

## The freeze

From phase 3 the ports are frozen. These changes keep the version:

- an optional field in what a port returns, which callers may ignore
- an optional method, which callers check for before they use it
- a new port

Anything else is breaking: it bumps the port's version, comes with a new
ADR, and updates the contract suite and every adapter in the same change.
That includes a new optional **input** that the adapter must honor, such as
a filter, an idempotency id or a snapshot: an old adapter would silently
ignore it and give wrong results. This is why `runId` on starts, the status
filter and the snapshot are in version 1.

## Consequences

- Adapters for Node and Cloudflare implement the same interfaces, and a
  contract suite can run unchanged in Node and `workerd`.
- The engine (phase 2) uses `RunStore.append` with a sequence check and the
  `Scheduler` for every wait, so it needs no timers of its own.
- `RunExecutor.start` and `send` return once the input is recorded, so
  callers follow progress through `subscribe` instead of polling.
