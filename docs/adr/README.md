# Architecture decision records

An architecture decision record (ADR) states one decision that shapes Halonic,
why we made it and what follows from it. Read the records to understand why the
code is built the way it is, before you change something they describe.

## Rules

- One decision per file, named `YYYY-MM-DD-short-title.md`.
- Use the [template](template.md).
- A record is not edited once it is accepted, except to fix a typo or to mark it
  as replaced. To change a decision, write a new record that says which one it
  replaces.
- A breaking change to a port (see [vendor code sits behind ports](2026-11-08-vendor-code-sits-behind-ports.md))
  comes with a record.

## Records

| Record | Decision |
| --- | --- |
| [Local first](2026-11-08-local-first.md) | Every feature works offline with local models before it gets a cloud option |
| [Definitions are files in git](2026-11-08-definitions-are-files-in-git.md) | A workspace is a folder of YAML and Markdown files, checked by schemas |
| [Runs are stored separately](2026-11-08-runs-are-stored-separately.md) | Each run is an append-only event log, kept apart from the definitions |
| [Artifacts are content-addressed](2026-11-08-artifacts-are-content-addressed.md) | Files a run produces are stored as blobs named by their hash |
| [Vendor code sits behind ports](2026-11-08-vendor-code-sits-behind-ports.md) | Everything vendor-specific is an adapter behind a port |
| [Model aliases](2026-11-08-model-aliases.md) | Agents name an alias; a file maps it to a provider and model |
| [Workflows are a statecharts subset](2026-11-08-workflows-are-a-statecharts-subset.md) | Workflows use a small, exact set of state types, defined as pure rules |
| [Interface is separate from logic](2026-11-08-interface-is-separate-from-logic.md) | All behaviour lives in a headless package; the Studio only renders it |
| [Testable by design](2026-11-08-testable-by-design.md) | Workflows, ports and requirements each have their own kind of test |
| [One interface codebase](2026-11-08-one-interface-codebase.md) | One React codebase for the Studio on desktop, Android and in the browser |
| [Plugins](2026-11-09-plugins.md) | One `plugin.yaml`; an integration is a plugin with only a backend (accepted) |
| [Port list and versions](2026-11-07-port-list-and-versions.md) | The first set of ports, one file each with a version, frozen once adapters start |
| [Record store compaction](2026-11-08-record-store-compaction.md) | `RecordStore.compact` drops overwritten and removed values from storage (v2) |
| [Sandbox fence proof](2026-11-09-sandbox-fence-proof.md) | A sandbox session proves its fence before `open` returns (v2) |
| [API types stand alone](2026-11-09-api-types-stand-alone.md) | `events` and `ports` use only each other, so callers get them without the engine |
| [Sandbox check reason codes](2026-11-09-sandbox-check-reason-codes.md) | `SandboxCheck.reason` is a listed code; Studio words it; no fallback (v3) |
| [Run snapshot is a cache](2026-11-09-run-snapshot-is-a-cache.md) | `RunStore` may drop a snapshot; only a crash can store part of an append |
| [Harness signed out](2026-11-09-harness-signed-out.md) | `detect()` can answer `signed-out`, with the version; never a guess (v2) |
| [Vcs versions and worktrees](2026-11-10-vcs-versions-and-worktrees.md) | `Vcs` reads commits, snapshots, renames, keeps worktrees, applies hunks (v2) |
| [MXC sandbox backend](2026-11-10-mxc-sandbox-backend.md) | On Windows 11, MXC is a second backend, used only after a trust check (proposed) |
| [Write only if unchanged](2026-11-10-write-only-if-unchanged.md) | `DefinitionStore.write` takes `expected` and won't write over a changed file (v2) |
| [Sandbox optional bridge](2026-11-10-sandbox-optional-bridge.md) | A profile's bridge may be `null`: no loopback, only the listed sites (v4) |
| [Package names](2026-11-11-package-names-inside-and-published.md) | Small private packages inside; on npm one package per layer, a subpath per piece |

The exact rules of the workflow decision are in the
[workflow semantics spec](../specs/workflow-semantics.md).
