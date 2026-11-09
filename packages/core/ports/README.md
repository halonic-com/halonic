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

| Port                      | File                           | Version | What it does                                                                                          | Contract suite                                           |
| ------------------------- | ------------------------------ | ------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `BlobStore`               | `blob-store.ts`                | 1       | content-addressed bytes: attachments, large payloads, exports                                         | `blob-store`                                             |
| `Clock`                   | `clock.ts`                     | 1       | the current time                                                                                      | `clock`                                                  |
| `ConnectionSettingsStore` | `connection-settings-store.ts` | 1       | each connector's "allow sending" setting in the user's profile; `ConnectionSettings` decides          | `connection-settings-store` (with first adapter)         |
| `ConnectorClient`         | `connector-client.ts`          | 1       | connector tools (MCP over HTTP or stdio, built-in Google), and their factory                          | `connector-client` (with first adapter)                  |
| `Coordination`            | `coordination.ts`              | 1       | leases, compare-and-set values, counters and windowed counts                                          | `coordination`                                           |
| `DefinitionStore`         | `definition-store.ts`          | 1       | the workspace files; `DefinitionSource` is its read-only side                                         | `definition-store`                                       |
| `Digest`                  | `digest.ts`                    | 1       | SHA-256 from the platform's WebCrypto                                                                 | `digest` (with first adapter)                            |
| `Harness`                 | `harness.ts`                   | 1       | what drives an agent (Halonic, Claude Code, Codex): detect it, start it, answer it, cancel it         | `harness` (with first adapter)                           |
| `HarnessBridgeServer`     | `harness-bridge-server.ts`     | 1       | opens one run's bridge: model requests to the provider, Halonic's tools and approvals over MCP        | `harness-bridge-server` (with first adapter)             |
| `HttpClient`              | `http-client.ts`               | 1       | outbound HTTP, replaces `FetchLike`                                                                   | `http-client` (with first adapter)                       |
| `IdGenerator`             | `id-generator.ts`              | 1       | unique ids                                                                                            | `id-generator`                                           |
| `Integration`             | `integration.ts`               | 1       | an integration's declaration and the `IntegrationHost` it is given: limited HTTP, scoped tokens       | `integration` (own package)                              |
| `KnowledgeProvider`       | `knowledge-provider.ts`        | 1       | knowledge sources agents search and read, and their factory                                           | `knowledge-provider` (with first adapter)                |
| `LlmCache`                | `llm-cache.ts`                 | 1       | model answers reused by simulation re-runs                                                            | `llm-cache` (with first adapter)                         |
| `LlmProvider`             | `llm-provider.ts`              | 1       | model providers, and their factory                                                                    | `llm-provider`, `llm-stream`                             |
| `PasswordHasher`          | `password-hasher.ts`           | 1       | hash and check the sign-in password                                                                   | `password-hasher` (with first adapter)                   |
| `ProgramProbe`            | `program-probe.ts`             | 1       | finds a harness's program and asks it something short, such as its version                            | `program-probe` (with first adapter)                     |
| `RecordStore`             | `record-store.ts`              | 2       | collection records as a change log; `compact` drops overwritten and removed values                    | `record-store`                                           |
| `RunExecutor`             | `run-executor.ts`              | 1       | start runs, send them events, stream their events, chat turns; replaces `Runtime` and `RunHost`       | `run-executor` (with the engine)                         |
| `RunStore`                | `run-store.ts`                 | 1       | run event logs (append with a sequence check) and run summaries                                       | `run-store`                                              |
| `Sandbox`                 | `sandbox.ts`                   | 3       | runs programs in a fence and reports blocked accesses; its profile is Halonic's own format            | `sandbox` (check; sessions with HAL-193)                 |
| `Scheduler`               | `scheduler.ts`                 | 1       | run timers and the routine tick; timers may arrive late or twice                                      | `scheduler`                                              |
| `Secrets`                 | `secrets.ts`                   | 1       | configured secrets, read-only                                                                         | `secrets`                                                |
| `TokenStore`              | `token-store.ts`               | 1       | secrets the server writes itself, such as refresh tokens                                              | `token-store`                                            |
| `ToolApprovalStore`       | `tool-approval-store.ts`       | 1       | approved listed tools in the user's profile, by workspace, source and name; `gateToolListing` decides | `tool-approval-store` (with first adapter)               |
| `TrustStore`              | `trust-store.ts`               | 1       | trust records in the user's profile, by location and fingerprint; `TrustService` decides              | `trust-store`                                            |
| `Vcs`                     | `vcs.ts`                       | 1       | version control of the workspace folder                                                               | `vcs`, `vcs-safety`, `vcs-hardened` (with first adapter) |

Suites marked "with first adapter" come with the first real adapter for
that port, and "with the engine" with the engine. The others are written
with the memory adapters.

`portVersions` holds the same list in code. A test fails when this table,
`portVersions` and the port files disagree.

A model call that fails throws `ModelCallError`, whose `reason` says why:
`no-key`, `offline`, `model-missing`, `model-no-tools` or `refused`. The
engine uses it to decide whether to try the next model. Check for it with
`isModelCallError`, not `instanceof`, because an adapter may have its own
copy of this package (requirement `model-call-error`). A chat turn outside a
run returns the models it skipped before calling them in
`ChatTurnResponse.skipped` (requirement `chat-turn-skipped`).

## Example

What a port is and how an adapter satisfies one: a `Secrets` adapter over a plain map, core-style
code that takes ports as arguments, and the version check. The code lives in
[`examples/a-port-and-an-adapter.ts`](examples/a-port-and-an-adapter.ts), where it is typechecked
and run by `src/example.test.ts`; keep this copy in step with it. The file imports
`../src/index.ts`, because a package may not import itself by name; outside this package, import
`@halonicjs/ports` as below.

```ts
import { type Clock, portVersions, type Secrets } from "@halonicjs/ports";

/**
 * A port is an interface plus a version. This adapter satisfies the `Secrets`
 * port from a plain map, and the code that depends on the port never sees
 * the difference.
 */
class MapSecrets implements Secrets {
  // The port says names differing only in case or `-` versus `_` are the same secret.
  readonly #values = new Map<string, string>();

  constructor(values: Record<string, string>) {
    for (const [name, value] of Object.entries(values)) this.#values.set(this.#key(name), value);
  }

  #key(name: string): string {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || name.length > 128) {
      throw new RangeError(`not a valid secret name: ${name}`);
    }
    return name.toUpperCase().replaceAll("-", "_");
  }

  async get(name: string): Promise<string | null> {
    return this.#values.get(this.#key(name)) ?? null;
  }
}

/** Core logic takes ports as arguments: it can run against any adapter, and tests fix the clock. */
async function describeKey(secrets: Secrets, clock: Clock): Promise<string> {
  const key = await secrets.get("provider-key");
  return `${clock.now().toISOString()}: ${key === null ? "no key" : "key set"}`;
}

/** Runs one adapter through the port and returns what it printed. */
export async function runExample(): Promise<string[]> {
  const secrets = new MapSecrets({ PROVIDER_KEY: "not-a-real-key" });
  const clock: Clock = { now: () => new Date("2026-01-01T00:00:00.000Z") };

  // The version check: an adapter records which version of the port it was written against.
  if (portVersions.Secrets !== 1) throw new Error("this adapter implements Secrets 1");

  return [
    `Secrets is version ${portVersions.Secrets}`,
    await describeKey(secrets, clock), // case and `-` versus `_` don't matter
    await describeKey(new MapSecrets({}), clock), // an unset name is `null`, not an error
  ];
}
```
