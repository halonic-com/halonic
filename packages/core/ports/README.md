# @halonicjs/ports

One file per port: the versioned interfaces that core logic depends on and adapters implement. Web types only.

- **Layer:** core
- **Owner:** liam
- **Public API:** `@halonicjs/ports`

## The ports

Each port file exports a version. From phase 3 the ports are **frozen**:
adapters are written against them, so a change may only add an optional
output field, an optional method or a new port. A new input that adapters
must honor counts as breaking. A breaking change bumps the version and comes
with an ADR (see [the port list ADR](../../../docs/adr/2026-11-07-port-list-and-versions.md)).
Every adapter for a port passes its contract suite in `packages/testing/contracts`.

| Port                | File                    | Version | What it does                                                                                    | Contract suite                 |
| ------------------- | ----------------------- | ------- | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| `BlobStore`         | `blob-store.ts`         | 1       | content-addressed bytes: attachments, large payloads, exports                                   | `blob-store`                   |
| `Clock`             | `clock.ts`              | 1       | the current time                                                                                | `clock`                        |
| `ConnectorClient`   | `connector-client.ts`   | 1       | connector tools (MCP over HTTP or stdio, built-in Google), and their factory                    | `connector-client` (phase 3)   |
| `Coordination`      | `coordination.ts`       | 1       | leases, compare-and-set values, counters and windowed counts                                    | `coordination`                 |
| `DefinitionStore`   | `definition-store.ts`   | 1       | the workspace files; `DefinitionSource` is its read-only side                                   | `definition-store`             |
| `HttpClient`        | `http-client.ts`        | 1       | outbound HTTP, replaces `FetchLike`                                                             | `http-client` (phase 3)        |
| `IdGenerator`       | `id-generator.ts`       | 1       | unique ids                                                                                      | `id-generator`                 |
| `KnowledgeProvider` | `knowledge-provider.ts` | 1       | knowledge sources agents search and read, and their factory                                     | `knowledge-provider` (phase 3) |
| `LlmCache`          | `llm-cache.ts`          | 1       | model answers reused by simulation re-runs                                                      | `llm-cache` (phase 3)          |
| `LlmProvider`       | `llm-provider.ts`       | 1       | model providers, and their factory                                                              | `llm-provider` (phase 3)       |
| `PasswordHasher`    | `password-hasher.ts`    | 1       | hash and check the sign-in password                                                             | `password-hasher` (phase 3)    |
| `RecordStore`       | `record-store.ts`       | 1       | collection records as a change log                                                              | `record-store`                 |
| `RunExecutor`       | `run-executor.ts`       | 1       | start runs, send them events, stream their events, chat turns; replaces `Runtime` and `RunHost` | `run-executor` (phase 2)       |
| `RunStore`          | `run-store.ts`          | 1       | run event logs (append with a sequence check) and run summaries                                 | `run-store`                    |
| `Scheduler`         | `scheduler.ts`          | 1       | run timers and the routine tick; timers may arrive late or twice                                | `scheduler`                    |
| `Secrets`           | `secrets.ts`            | 1       | configured secrets, read-only                                                                   | `secrets`                      |
| `TokenStore`        | `token-store.ts`        | 1       | secrets the server writes itself, such as refresh tokens                                        | `token-store`                  |
| `Vcs`               | `vcs.ts`                | 1       | version control of the workspace folder                                                         | `vcs` (phase 3)                |

Suites without a phase are written with the memory adapters; the
others come with the first real adapter for that port.

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
