# The first port list and port versions

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Core logic depends on ports, and adapters implement them. The old repo had
one `ports` file with 4 contract suites, a `FetchLike` type, and two ports
that overlapped (`Runtime` and `RunHost`). The multi-cloud design adds ports
for timers, coordination, outbound HTTP and password hashing, and requires
that every port works on Node, on Workers and in the browser.

Adapters are written against these ports, so the list has to be settled
before the first adapter starts.

## Decision

**One file per port in `packages/core/ports/src`, each with a version
constant.** All start at version 1. `portVersions` lists them in code and
the package README lists them in a table. A test fails when the files, the
list and the table disagree.

**Ports name only Web-standard types** (`Request`, `Response`,
`AbortSignal`, `RequestInit`, `Uint8Array`), through the core TypeScript
preset. Times that adapters store are ISO text, and durations are
milliseconds as numbers, so every runtime can keep them as they are.

| Port | From the old repo |
| --- | --- |
| `DefinitionStore` | same methods. New read-only side, `DefinitionSource`, which is all a cloud deployment hands out. Every method refuses absolute paths, `..`, backslashes and NUL; the old repo checked only in the Node adapter. _(2026-11-08, HAL-181)_ It also refuses `.git`, `.studio`, `.env`, `.envrc` and `.env.*` segments (any case, trailing dots or spaces, HFS+ ignorable code points), any segment with `:` or `~` and a digit, and any link or reparse point, and `list()` skips them |
| `RunStore` | `append(event)` becomes `append(runId, expectedSeq, events, { snapshot })`: it returns a conflict instead of letting two writers both win, and stores the engine's state snapshot in the same write. New `snapshot(runId)`. `events` takes `afterSeq`. `list` filters by status, so the watchdog finds stuck runs, and may lag the log |
| `RecordStore`, `Clock`, `LlmCache` | unchanged |
| `BlobStore` | unchanged, except that `get` returns `null` for anything but a 64-character lowercase hex hash, without touching storage |
| `Vcs` | unchanged; the docs now say what the old git adapter did (`log` newest first, `pull` fast-forward only) |
| `IdGenerator` | unchanged; ids are unique but not secret |
| `Secrets` | read-only: the optional `set` is gone. Names match `^[A-Za-z][A-Za-z0-9_-]*$`, at most 128 characters; stores that can't hold `-` map it to `_`, as the old environment adapter did |
| `TokenStore` | new: what the server writes itself (refresh tokens), split out of `Secrets`. Same name rule |
| `LlmProvider`, `KnowledgeProvider`, `ConnectorClient` and their factories | unchanged, except that factories get an `HttpClient` instead of `fetch`, and an assistant turn carries an optional `replay`: the provider's own record of it (such as Anthropic's thinking blocks), which the engine stores and hands back unchanged. Knowledge factories get the read-only `DefinitionSource`. Connector factories also get the `TokenStore` |
| `HttpClient` | new, replaces `FetchLike`. Same signature as the Web `fetch`. An adapter that refuses addresses checks every redirect hop and the resolved address |
| `RunExecutor` | new, replaces `Runtime` and `RunHost`: `start`, `startAgent`, `send`, `subscribe` and `chatTurn`. A start may carry its own `runId`, and repeating it returns the existing run, so routine fires, mails and signals start one run each. `subscribe` takes `onEvent` and `onClose(error?)`, so a client can tell a dropped stream from a quiet run. Subflows are internal to the executor, so the request has no `parent` |
| `Scheduler` | new: `schedule`, `cancel` and `pending` timers per key, and a `SchedulerFactory` that takes the `SchedulerListener`. Timers may arrive late or twice; `at` is the time the timer was set for. A timer set again during `onTimer` stays. A rejecting `onTimer` is retried with backoff from 1 second up to 15 minutes, never dropped |
| `Coordination` | new: leases (`tryAcquire`, `renew` keeping the token, `release`), `read` and `compareAndSet` values (`null` deletes), `increment` with a limit, and `countInWindow` for login limits. Keys up to 256 bytes; amounts are positive whole numbers, money in micro-units; bad input throws `RangeError` |
| `PasswordHasher` | new: `hash`, `verify`, `needsRehash`. Fixed format `$scrypt$ln=14,r=8,p=5$<salt>$<key>` over the NFC password, with a known-answer vector; `verify` throws on a malformed hash. The old server compared SHA-256 of a plain-text password |

**Left out of the ports on purpose:**

- `RunHost.runRoutine`, `blockedRoutines` and `deployment` are host status
  and routine control. They become typed commands of the host RPC later. The routine
  scheduler service in `core/app` starts routine runs through
  `RunExecutor.start` or `startAgent`, each with a trigger, so a routine
  finds its own runs again whether it runs a workflow or one agent.
- `RunHost.connectorTools` and `callConnectorTool` (connector tools for the
  chat panel, outside a run) wait for the `ConnectorReadService` and the
  gate for tool calls outside a run. They come back as a new port then.
- Run log additions come with the engine and are not in
  `@halonicjs/events` yet. All of them are additive. They are:
  - three optional fields (`tool.result.outcome`,
    `run.failed.reason`, `approval.resolved.by`), which are now in
    `@halonicjs/events` (HAL-1525) so the engine can write them
  - the definitions a run started with, so it keeps them: not embedded in
    `run.started`, but kept as canonical JSON in the `BlobStore` under their
    SHA-256, which the existing `run.started.definitionsVersion` names, so
    the run log doesn't change (HAL-186 decision 5)
  - the "effect requested" record that marks an outcome as unknown after a
    crash
  - the blob hash reference for payloads over 256 KB, which is now
    `tool.result.resultBlob` in `@halonicjs/events` (HAL-1533): tool results
    are where large payloads come from
- A live-progress channel (tokens, "typing") and cancelling a run. The old
  Studio has neither, so there is no parity gap; both can come later as
  optional methods.

## The freeze

Once adapters are written against them, the ports are frozen. These
changes keep the version:

- an optional field in what a port returns, which callers may ignore
- an optional method, which callers check for before they use it
- a new port

Anything else is breaking: it bumps the port's version, comes with a new
ADR, and updates the contract suite and every adapter in the same change.
That includes a new optional **input** that the adapter must honor, such as
a filter, an idempotency id or a snapshot: an old adapter would silently
ignore it and give wrong results. This is why `runId` on starts, the status
filter and the snapshot are in version 1.

## Added before the freeze

_2026-11-08, decided on HAL-181, built in HAL-231._ The trust gate
(HAL-65 requirements) adds inputs that adapters must honor, so they go into
version 1 now rather than as a version 2 later. The versions stay at 1.

- **`ConnectorFactoryContext.trust`:** the `TrustGrant` (location and
  fingerprint) for the connector's workspace, or `null`. It is required, so
  a caller can't leave it out by mistake. Without a grant a stdio connector
  never starts its program, an `http` connector calls no tool, and the
  `google` connector calls only tools whose own `risk` is `read`. The host
  also checks: without a grant it ignores a `risk` the workspace sets, so
  a listed tool counts as `write`, and it calls only `read` tools. An
  `http` adapter can't use the listed `risk`, because the server wrote it.
  `TrustService` in `core/app` decides; adapters only check that a grant
  is there.
- **`pin` on the stdio transport:** the registry kind, the registry address
  from the user's profile, the package and the exact version. The app fills
  it from the trust record, never from workspace YAML. A package runner
  (`npx`, `uvx`, `pnpm dlx` and the others the port lists) without a pin
  doesn't start, and neither does one whose version is a tag or a range.
  The adapter starts only that version, looks it up only at that address,
  starts in an empty folder of its own and refuses environment variables
  that move the registry or run code first, such as `NODE_OPTIONS` and
  `npm_config_*`. `ConnectorTool.risk` (`read`, `write`, `send`) was
  already added with the Google adapter work.

  Update 2026-11-09 (C188, HAL-2134): in 0.1 an unpinned runner starts
  once trusted; pinning at trust is Later.
- **No integrity hash in the pin, on purpose.** An exact version guards
  against a new release, not against a registry that serves other files.
  The registry address comes from the user's profile, so the user already
  trusts it, and a Python package has a different file, so a different
  hash, per platform. A hash would be a version 2 change with its own ADR.
- **`TrustStore`, a new port:** `get`, `grant`, `revoke` and `list` trust
  records by location. A record holds the fingerprint, the normalised
  content it was computed from, the time, the app version, the connector
  pins and how it was granted. The port only stores: `TrustService` in
  `core/app` resolves the location, computes the fingerprint and decides.
  Records live in the user's profile, never in a workspace. A record that
  can't be read makes `get` and `list` throw with its location, so the
  service treats the source as untrusted and says why, and `revoke` still
  deletes it. `list` is in version 1 because `halonic trust --list` and
  the trusted-sources list need it.
- **`LlmProvider.stream?(request)`:** an optional method that yields text,
  reasoning and tool-call deltas (`ChatStreamEvent`) and ends with one
  `done` event holding the full `ChatResponse`. A provider offers it only
  when `capabilities.streaming` is true. It gives the phase 3 streaming
  adapters a contract. Nothing in the engine reads it yet: `RunExecutor`
  still has no live-progress channel (see above).

_2026-11-09, planned on HAL-520._ Two new ports, which keep every
version at 1:

- **`ToolApprovalStore`:** `get`, `approve`, `revoke` and `list` the listed
  tools a person approved (`ports.listed-tool-approval`), keyed by
  workspace location, source id and listed name. It lives in the user's
  profile next to the trust records, never in a workspace, and is separate
  from `TrustRecord`, so an edit to the workspace doesn't throw every
  approval away. The port only stores: `gateToolListing` in `core/app`
  decides.
- **`Digest`:** `sha256` over bytes, from the platform's WebCrypto. The
  core needs SHA-256 for the approval hash and can't call WebCrypto itself.

_2026-11-09, signed off on HAL-850, built in HAL-2210._ `ToolApprovalStore`
changes before any adapter is written against it, so it stays at version 1
(see "The freeze"):

- An approval now holds the tool as `readToolListing` gives it back
  (`ListedToolText`) and its `fingerprint`, instead of the raw listing and
  a `hash`, because the board chose to fingerprint what the model sees.
  The server's address moves out of the hashed material into its own
  `server` field, and an integration's address is its id and version only.
- **`noteWaiting(key, version)`**, a fifth method: it notes a waiting
  version of a tool and returns the versions noted, at most
  `maxWaitingVersions`. The host needs it, across runs, to stop asking
  about a tool its server keeps changing (more than 3 versions in a day).
  It only stores; `approveListedTools` in `core/app` counts and decides.
- The host no longer revokes the approval of a tool the listing stops
  returning, so the tool is on again if it comes back unchanged.

_2026-11-09, decided on HAL-1515, built in HAL-1521._ Approvals are routed
by `callId` (HAL-186, E5). An executor must honor it, so it goes into
version 1 now. `RunExecutor` stays at 1:

- **`RunExecutor.send(runId, event, payload?, options?)`:** a fourth
  argument, the named `SendOptions`, with an optional `callId` that names
  the tool call the event is meant for. The engine gives every call its own
  id (`call-<n>`, unique in the run), so the id never comes from the
  model. When `callId` is given and the run doesn't wait on that call, the
  executor refuses the event before it records anything. A person who
  answers an approval that has moved on can't approve the next call by
  mistake. Without `callId` nothing is checked, as before. The contract
  suite checks this (`contracts.run-executor-send`). The type is named so
  later options have a place, but a new option an executor must honor is
  still a breaking change (see "The freeze").

_2026-11-09, decided on HAL-1616, built in HAL-1531 (HAL-186 step 7b)._
One new port, at version 1:

- **`ConnectionSettingsStore`:** `get`, `save` and `remove` a connector's
  settings (`ports.connection-settings-store`), keyed by workspace location
  and connector id. For now the settings hold only "allow sending" (HAL-9
  decision 5). They live in the user's profile, never in a workspace, so an
  agent that edits the workspace can't switch sending on. The port only
  stores: `ConnectionSettings` in `core/app` treats missing settings as
  sending off, and the engine and the outside-a-run gate ask it. This is
  not the new port that `RunHost.connectorTools` and `callConnectorTool`
  come back as (see above): those stay out, and the outside-a-run gate is
  a check in `core/app` that reads this port.

_2026-11-10, proposed on HAL-3385 for the trust check's "Runs" line (design on HAL-1873, approved by the board on HAL-1949); Liam reviews it._
One new port, at version 1:

- **`UnfencedRunConsentStore`:** `get`, `save` and `remove` the user's one
  yes to run plugin and integration code without the sandbox on this
  computer (`ports.unfenced-run-consent-store`): the reason it was given for
  and when. It lives in the user's profile, never in a workspace, sheet,
  setting or config file, and there is no CLI flag for it (I5 design
  4.3.1), so neither a workspace nor an agent can give it. The port only
  stores: `UnfencedRuns` in `core/app` decides from it and the fence status,
  and asks again when the reason changes, when the computer passed the
  sandbox check before, and after Take back.

_2026-11-10, proposed on HAL-1735 for the plugin service (plugins P2), approved by Liam on HAL-4038 (decision D1)._
One new port, at version 1:

- **`FolderReader`:** lists every entry under a folder, with its kind and
  a file's size, reads a file's bytes and gives an entry's real location
  (`ports.folder-reader`). A plugin's trust fingerprint covers every byte
  of every file in its folder, and `DefinitionSource` can't give that: it
  reads text and hides links, `.git` and `.env` names, which is right for
  a workspace and wrong for a plugin, whose code could read any of them.
  So the new port hides nothing, lists links and special files without
  following them, and sorts by code-unit order with "/" separators, so a
  fingerprint is the same on every system. It only reads. Adding byte
  reads and a "show everything" mode to `DefinitionSource` instead would
  mix two opposite rules on one port.

_2026-11-11, proposed on HAL-1736 for installing plugins (plugins P3); Liam reviews it._
One new port, at version 1:

- **`PluginFolderWriter`:** `place` a plugin's files as the folder named
  by its id in the profile's plugins folder, and `remove` one entry there
  (`ports.plugin-folder-writer`). Installing needs to write, and
  `FolderReader` only reads; a general file writer would let a caller
  write anywhere in the profile. So the port writes whole plugin folders
  and nothing else: `place` writes beside the plugins folder and moves the
  result in, so `PluginService.load()` never lists a half-written plugin,
  and an id already there in any case is `taken` unless the caller
  replaces a real folder with exactly that id. Nothing is written or
  deleted through a link, so removing a link entry leaves what it points
  to alone. The plugin service writes the bytes it hashed, so what is
  trusted is what was placed; reading the source and checking it stay in
  `core/app`.

_2026-11-11, proposed on HAL-6159 for the settings host API (T11 PR 7, design on HAL-6159), reviewed by Liam on HAL-6216._
One new port, at version 1:

- **`HostSettingsStore`:** `read` every saved setting by key, `set` one
  key's JSON value (or remove it) and `watch` for changes
  (`ports.host-settings-store`). These are the settings kept where
  Halonic runs, for every workspace on that computer: the assistant and
  the sandbox default. They live in the user's profile, never in a
  workspace file, and a provider key is never one of them. Settings save
  by themselves one control at a time (HAL-1102), so a save changes one
  key, and two windows that change two settings keep both. `watch` only
  says something may have changed, so an adapter can sit on a file
  watcher or a Tauri channel; the caller reads again. The port only
  stores: `HostSettings` in `core/app` gives each setting its schema and
  default. `remove(key)` removes a key, so a value is any JSON value,
  `null` included, and nothing depends on `undefined` surviving the
  Tauri command.
- **Saves take turns, within one process.** A save reads the settings,
  changes one key and writes them back, so each adapter runs its saves one
  at a time; all desktop windows save through the one Rust process. Between
  processes (the CLI and the desktop app saving at the same moment) the
  last save wins for v1: it is rare, it loses one setting at most, and a
  lock file would cost more than it saves.
- **Nothing is lost silently.** Settings that can't be parsed read as none
  saved, and the first save over them keeps them as `host.json.broken`. A
  save keeps keys and fields it doesn't know, and a newer `version`, as
  they are. The key form, the 256 KiB limit and the saved shape are golden
  cases in the contract suite
  (`packages/testing/contracts/src/golden/host-settings-limits.json`) that
  the TypeScript helpers and the Rust side both pass (review on HAL-6216).

## Additive after the freeze: optional hints

_2026-11-10, decided by Liam on HAL-3756, built in HAL-1532 (HAL-186 step 4c, part 4)._
"The freeze" calls a new optional input breaking when the adapter **must
honor** it, because an old adapter would ignore it and give wrong results.
A **hint** is different: an optional input that no caller's correctness
depends on, so an adapter may use it or ignore it, and the result is right
either way. A hint keeps the port's version, as long as:

- it sits in an optional options object, so later hints need no new
  argument, and every field in it is optional
- its doc says that an adapter may ignore it
- the contract suite has a case that an adapter accepts it and still works
  when it ignores it

The first hint is `ConnectorClient.callTool(name, args, { idempotencyKey? })`
(`ports.connector-call-hints`, `contracts.connector-call-hints`): the
`<runId>:<callId>` key a run records before a connector call that can change
things. An adapter may pass it on, so a server that knows it can drop a
duplicate. The guarantee doesn't rest on it: the run log, the unknown
outcome and a person's `retry` or `skip` (`engine.unknown-outcome`) keep a
call from being made twice on its own. `ConnectorClient` stays at version 1.

## Consequences

- Adapters for Node and Cloudflare implement the same interfaces, and a
  contract suite can run unchanged in Node and `workerd`.
- The engine uses `RunStore.append` with a sequence check and the
  `Scheduler` for every wait, so it needs no timers of its own.
- `RunExecutor.start` and `send` return once the input is recorded, so
  callers follow progress through `subscribe` instead of polling.
