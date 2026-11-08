# @halonicjs/ports

One file per port: the versioned interfaces that core logic depends on and adapters implement. Web types only.

- **Layer:** core
- **Owner:** liam
- **Public API:** `@halonicjs/ports`

## The ports

Each port file exports a version. The ports are **frozen**: adapters are
written against them, so a change may only add an optional output field,
an optional method or a new port. A new input that adapters must honor
counts as breaking. A breaking change bumps the version and comes with an
ADR (see [the port list ADR](../../../docs/adr/2026-11-07-port-list-and-versions.md)).
Every adapter for a port passes its contract suite in `packages/testing/contracts`.

| Port                | File                    | Version | What it does                                                                                    | Contract suite                            |
| ------------------- | ----------------------- | ------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `BlobStore`         | `blob-store.ts`         | 1       | content-addressed bytes: attachments, large payloads, exports                                   | `blob-store`                              |
| `Clock`             | `clock.ts`              | 1       | the current time                                                                                | `clock`                                   |
| `ConnectorClient`   | `connector-client.ts`   | 1       | connector tools (MCP over HTTP or stdio, built-in Google), and their factory                    | `connector-client` (with first adapter)   |
| `Coordination`      | `coordination.ts`       | 1       | leases, compare-and-set values, counters and windowed counts                                    | `coordination`                            |
| `DefinitionStore`   | `definition-store.ts`   | 1       | the workspace files; `DefinitionSource` is its read-only side                                   | `definition-store`                        |
| `HttpClient`        | `http-client.ts`        | 1       | outbound HTTP, replaces `FetchLike`                                                             | `http-client` (with first adapter)        |
| `IdGenerator`       | `id-generator.ts`       | 1       | unique ids                                                                                      | `id-generator`                            |
| `Integration`       | `integration.ts`        | 1       | an integration's declaration and the `IntegrationHost` it is given: limited HTTP, scoped tokens | `integration` (own package)               |
| `KnowledgeProvider` | `knowledge-provider.ts` | 1       | knowledge sources agents search and read, and their factory                                     | `knowledge-provider` (with first adapter) |
| `LlmCache`          | `llm-cache.ts`          | 1       | model answers reused by simulation re-runs                                                      | `llm-cache` (with first adapter)          |
| `LlmProvider`       | `llm-provider.ts`       | 1       | model providers, and their factory                                                              | `llm-provider` (with first adapter)       |
| `PasswordHasher`    | `password-hasher.ts`    | 1       | hash and check the sign-in password                                                             | `password-hasher` (with first adapter)    |
| `RecordStore`       | `record-store.ts`       | 1       | collection records as a change log                                                              | `record-store`                            |
| `RunExecutor`       | `run-executor.ts`       | 1       | start runs, send them events, stream their events, chat turns; replaces `Runtime` and `RunHost` | `run-executor` (with the engine)          |
| `RunStore`          | `run-store.ts`          | 1       | run event logs (append with a sequence check) and run summaries                                 | `run-store`                               |
| `Scheduler`         | `scheduler.ts`          | 1       | run timers and the routine tick; timers may arrive late or twice                                | `scheduler`                               |
| `Secrets`           | `secrets.ts`            | 1       | configured secrets, read-only                                                                   | `secrets`                                 |
| `TokenStore`        | `token-store.ts`        | 1       | secrets the server writes itself, such as refresh tokens                                        | `token-store`                             |
| `TrustStore`        | `trust-store.ts`        | 1       | trust records in the user's profile, by location and fingerprint; `TrustService` decides        | `trust-store`                             |
| `Vcs`               | `vcs.ts`                | 1       | version control of the workspace folder                                                         | `vcs` (with first adapter)                |

Suites marked "with first adapter" come with the first real adapter for
that port, and "with the engine" with the engine. The others are written
with the memory adapters.

`portVersions` holds the same list in code. A test fails when this table,
`portVersions` and the port files disagree.

## Example

```ts
import type { Clock, RunStore } from "@halonicjs/ports";
import type { RunEvent } from "@halonicjs/events";

/** Records that a run entered a state, unless another writer got there first. */
async function enterState(
  runs: RunStore,
  clock: Clock,
  runId: string,
  lastSeq: number,
  state: string,
) {
  const event: RunEvent = {
    runId,
    seq: lastSeq + 1,
    at: clock.now().toISOString(),
    type: "state.entered",
    state,
  };
  const result = await runs.append(runId, lastSeq, [event]);
  if (!result.ok) throw new Error(`run ${runId} moved on to event ${result.lastSeq}`);
}
```
