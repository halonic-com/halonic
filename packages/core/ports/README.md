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

| Port | File | Version | What it does | Contract suite |
| --- | --- | --- | --- | --- |
| `AgentPlacementStore` | `agent-placement-store.ts` | 1 | each agent's "this computer" choice in the user's profile; `AgentPlacement` decides | `agent-placement-store` |
| `BlobStore` | `blob-store.ts` | 1 | content-addressed bytes: attachments, large payloads, exports | `blob-store` |
| `Clock` | `clock.ts` | 1 | the current time | `clock` |
| `ConnectionSettingsStore` | `connection-settings-store.ts` | 1 | each connector's "allow sending" setting in the user's profile; `ConnectionSettings` decides | `connection-settings-store` |
| `ConnectorClient` | `connector-client.ts` | 1 | connector tools (MCP over HTTP or stdio, built-in Google), and their factory | `connector-client` |
| `Coordination` | `coordination.ts` | 1 | leases, compare-and-set values, counters and windowed counts | `coordination` |
| `DefinitionStore` | `definition-store.ts` | 2 | the workspace files; `DefinitionSource` is its read-only side | `definition-store` |
| `Digest` | `digest.ts` | 1 | SHA-256 from the platform's WebCrypto | `digest` (with first adapter) |
| `FolderReader` | `folder-reader.ts` | 1 | every entry and byte of a folder, links listed but never followed; the plugin service hashes plugins | `folder-reader` |
| `Harness` | `harness.ts` | 2 | what drives an agent (Halonic, Claude Code, Codex): detect it, sign in, start, answer, cancel it | `harness` (with first adapter) |
| `HarnessBridgeServer` | `harness-bridge-server.ts` | 1 | opens one run's bridge: model requests to the provider, Halonic's tools and approvals over MCP; a model request the recorder refuses with `limit_reached` gets a 429 and never reaches the provider | `harness-bridge-server` (with first adapter) |
| `HostSettingsStore` | `host-settings-store.ts` | 1 | the settings kept where Halonic runs (assistant, sandbox default) in the user's profile, by key; `HostSettings` decides | `host-settings-store` |
| `HttpClient` | `http-client.ts` | 1 | outbound HTTP, replaces `FetchLike` | `http-client` (with first adapter) |
| `IdGenerator` | `id-generator.ts` | 1 | unique ids | `id-generator` |
| `Integration` | `integration.ts` | 1 | an integration's declaration and the `IntegrationHost` it is given: limited HTTP, scoped tokens | `integration` (own package) |
| `KnowledgeProvider` | `knowledge-provider.ts` | 1 | knowledge sources agents search and read, and their factory | `knowledge-provider` |
| `LlmCache` | `llm-cache.ts` | 1 | model answers reused by simulation re-runs | `llm-cache` (with first adapter) |
| `LlmProvider` | `llm-provider.ts` | 1 | model providers, and their factory | `llm-provider`, `llm-stream` |
| `PasswordHasher` | `password-hasher.ts` | 1 | hash and check the sign-in password | `password-hasher` (with first adapter) |
| `PluginFolderWriter` | `plugin-folder-writer.ts` | 1 | places and removes whole plugin folders in the profile's plugins folder, never through a link | `plugin-folder-writer` |
| `ProgramProbe` | `program-probe.ts` | 1 | finds a harness's program and asks it something short, such as its version | `program-probe` (with first adapter) |
| `RecordStore` | `record-store.ts` | 2 | collection records as a change log; `compact` drops overwritten and removed values | `record-store` |
| `ResourceProbe` | `resource-probe.ts` | 1 | the engine's memory, the processes it started, a folder's size and free disk space | `resource-probe` |
| `RunExecutor` | `run-executor.ts` | 1 | start, send events, stream them, cancel (optional), chat turns; replaces `Runtime` and `RunHost` | `run-executor` (with the engine) |
| `RunStore` | `run-store.ts` | 1 | run event logs (append with a sequence check) and run summaries | `run-store` |
| `Sandbox` | `sandbox.ts` | 6 | runs programs in a fence and reports blocked accesses; its profile is Halonic's own format | `sandbox` (check; sessions with HAL-193) |
| `Scheduler` | `scheduler.ts` | 1 | run timers and the routine tick; timers may arrive late or twice | `scheduler` |
| `Secrets` | `secrets.ts` | 1 | configured secrets, read-only | `secrets` |
| `TokenStore` | `token-store.ts` | 1 | secrets the server writes itself, such as refresh tokens | `token-store` |
| `ToolApprovalStore` | `tool-approval-store.ts` | 1 | approved listed tools in the user's profile, by workspace, source, name; `approveListedTools` decides | `tool-approval-store` (with first adapter) |
| `TrustStore` | `trust-store.ts` | 1 | trust records in the user's profile, by location and fingerprint; `TrustService` decides | `trust-store` |
| `UnfencedRunConsentStore` | `unfenced-run-consent-store.ts` | 1 | the user's yes to run plugin and integration code without the sandbox; `UnfencedRuns` decides | `unfenced-run-consent-store` |
| `Vcs` | `vcs.ts` | 2 | version control of the workspace folder | `vcs`, `vcs-safety`, `vcs-hardened` (with first adapter) |

Suites marked "with first adapter" come with the first real adapter for
that port, and "with the engine" with the engine. The others are written
with the memory adapters.

`portVersions` holds the same list in code. A test fails when this table,
`portVersions` and the port files disagree.

`ConnectorFactoryContext.sandbox` is optional (the port stays at version 1). When it is set, a `stdio`
connector starts its program in that `SandboxSession` and nowhere else: a factory that starts programs
on this computer refuses the context, and a session whose fence proof isn't `fenced` starts nothing,
whatever the person said about running without the sandbox (requirement
`connector-sandbox-session`, draft until the sandboxed stdio adapter exists).

A model call that fails throws `ModelCallError`, whose `reason` says why:
`no-key`, `offline`, `model-missing`, `model-no-tools`, `out-of-memory`,
`key-refused`, `out-of-credit`, `provider-busy` or `refused`, with the `host` that didn't answer for `offline`. The engine uses
it to decide whether to try the next model. A provider finds `out-of-memory`
in a model server's error text with `isModelOutOfMemory` (requirement
`model-out-of-memory-text`). Check for it with
`isModelCallError`, not `instanceof`, because an adapter may have its own
copy of this package (requirement `model-call-error`). A chat turn outside a
run returns the models it skipped before calling them in
`ChatTurnResponse.skipped` (requirement `chat-turn-skipped`).

Three files hold shared types, not a port: `chat.ts` (the messages of a model
call), `run-failure-error.ts` and `cant-try-error.ts`. The second has
`RunFailureError`, which an adapter that isn't a model provider throws to tell
the engine why a run can't go on: the disk is full, or the sandbox or the
harness didn't start (requirement `run-failure-error`). Check for it with
`isRunFailureError`. The third has `CantTryError`, which a Try it or Test
adapter throws when a step needs a change left out of the run, so the run ends
as can't-try instead of failed (requirement `cant-try-error`). Check for it
with `isCantTryError`.

## Rules that ship with the ports

Some port rules are code, not only text, so that every adapter applies the same one. They are exported
next to the ports:

| Export | What it does | Requirement |
| --- | --- | --- |
| `isSecretName`, `secretKey`, `isQuotableSecretName`, `describeSecretName` | the `Secrets` name rule: a letter, then letters, digits, `-` or `_`, at most 128 characters; `secretKey` gives the matching form (upper case, `-` as `_`) and throws a `RangeError` for a bad name | `secret-name-rule` |
| `workspaceSecrets`, `halonicSecretNames`, `isHalonicSecretName`, `tokenNamePrefix`, `isPluginSecretName`, `pluginSecretNamePrefix` | a view of `Secrets` for the names a workspace picks; it refuses Halonic's own secrets, token names and plugin secrets | `workspace-secrets` |
| `checkWorkspacePath`, `checkPublicWorkspacePath`, `isPrivateWorkspacePath` | the path rules of `DefinitionSource`: refuse unsafe paths, and private ones for the public check | `workspace-path-checks` |
| `segmentAsOpened` | a path segment as the private-entry rule compares names: without the code points HFS+ ignores, case folded, without trailing dots and spaces | `segment-as-opened` |
| `checkRunAppend`, `matchesRunFilter`, `startedAtOrAfter`, `compareRunSummaries`, `runLockFormat`, `runLockStaleAfterMs` | the append checks, list filter (`startedAtOrAfter` compares two ISO times as times), order and lock rules of `RunStore` | `run-store-checks` |
| `foldRecords`, `compactedChanges` | fold record changes into the current records, and into one `seed` each when compacting | `record-fold` |
| `checkCommitId` | refuses any `Vcs` version that is not a full commit id, with a `RangeError` | `vcs-commit-ref` |
| `isAgentPlacementFor` | whether a stored agent placement is valid for its key | `agent-placement-store` |
| `isUnreadableToolApprovalError`, `maxWaitingVersions` | recognise an unreadable tool approval without `instanceof`, and how many waiting versions of a tool are kept | `listed-tool-approval` |
| `priceOf` | what a model call costs from a `ModelPrice` and the tokens used | `model-price` |
| `addHarnessEnvironment`, `harnessBridgeTokenHeader` | add a harness's environment without replacing a variable that is set; the header that carries the run's bridge token | `harness-environment` |
| `bridgeCallCharge` | what a bridged call costs and who paid (`paidBy: "subscription"` for a sign-in call); `bridgeCallCost` is deprecated in its favour | `harness-bridge-server` |
| `maxIntegrationWaitMs` | the longest `IntegrationHost.wait`, 30 seconds | `integration-host` |
| `sandboxUnavailableReasons`, `adapterFailures`, `modelCallErrorReasons` | the lists behind `SandboxUnavailableReason`, `AdapterFailure` and `ModelCallErrorReason` | `sandbox-check-reason`, `run-failure-error`, `model-call-error` |

The types these use (`RunFilter`, `RecordChange`, `ToolCall` and the rest) are exported from
`src/index.ts` and documented where they are declared.

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
