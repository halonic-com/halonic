# Package names: many small packages inside, one package per layer on npm

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The repo has about 60 workspace packages, grouped by layer in folders:
`packages/core/*`, `packages/adapters/*`, `packages/host/*`,
`packages/studio/*`, `packages/testing/*`. Someone reading an import such as
`@halonicjs/adapter-integration-kit` may ask why it isn't one package per
layer, for example `import { X } from "@halonicjs/core"`. Inside the repo,
one big package per layer would undo the checks that rely on small packages.
On npm, sixty packages would be sixty names to version, document and keep
stable, and their split is an internal detail. Before 0.1.0 is published we
write down which names live where. The board chose the npm side in HAL-45.

## Decision

**Inside the repo, packages stay small and private.** The folders don't
change. Each package belongs to one layer and does one job, and its name
follows from its folder
([checks guide](../guides/checks.md#package-names-and-layers)). We keep them
small because:

- `pnpm check` sets rules per package: the API types packages use only each
  other ([decision](2026-11-09-api-types-stand-alone.md)), and `coreOrder`
  says which core package may use which. In one big `core` package these
  rules would hold only by convention.
- An integration or Studio depends only on what it imports, so its
  dependency tree and its bundle stay small.
- Tests, coverage floors, mutation runs and the owner in `package.json` are
  per package, so they stay specific.

**On npm, there is one package per layer, and one subpath per piece.** The
pieces inside a layer get no npm package of their own. `tooling/publish`
builds each layer package from the small packages in its folder, and each
piece becomes a subpath:

```ts
import { runWorkflow } from "@halonicjs/core"; // the layer's main entry
import type { ToolPort } from "@halonicjs/core/ports"; // one piece
```

Bundlers drop what a caller doesn't use. Plain Node has no bundler and loads
everything the main entry exports, so each piece has its own subpath, and
through a subpath Node loads only that piece. All pieces of a layer share
one version and are released together.

**A subpath is a promise.** A version of a layer package only exports the
subpaths we are ready to keep stable, and later versions add more. That lets
us use the layer names from 0.1.0 without publishing the engine before its
API is settled.

| npm package | Folder | Subpaths | When |
| --- | --- | --- | --- |
| `@halonicjs/adapters` | `packages/adapters/` | `/integration-kit` (only the part integrations use) | **0.1.0** |
| `@halonicjs/testing` | `packages/testing/` | `/integration` (the test suite for integrations) | **0.1.0** |
| `@halonicjs/core` | `packages/core/` | main entry and one per folder: `/ports`, `/events`, `/workflow` … | once the engine API is public |
| `@halonicjs/adapters` | `packages/adapters/` | more: `/model-anthropic`, `/mcp`, `/fs-node` … | together with core |
| `@halonicjs/testing` | `packages/testing/` | more: `/contracts`, `/scenario` | together with core |
| `@halonicjs/studio` | `packages/studio/` | `/kit` and other Studio parts, with `react` as a peer dependency | only for outside plugins |
| `halonic` | `apps/cli/` | none: it is a command, an app and not a layer, so it keeps its name | when the CLI ships on npm |

An adapter's outside dependency becomes an optional dependency of
`@halonicjs/adapters`, so only users of that subpath install it (for
example the sandbox runtime behind `/sandbox-srt`).

**Never on npm:** `apps/studio` and `apps/agent-host` (they ship inside the
desktop app), `packages/host` and the Tauri adapters (desktop only), and
`tooling/` (our own tools).

**Core packages keep names without a prefix.** Every other layer prefixes its
packages (`adapter-`, `studio-`, `testing-` …), core doesn't:
`@halonicjs/ports`, not `@halonicjs/core-ports`. We keep this. The internal
names are never published, so the difference costs nothing outside the repo,
while a rename would touch every import of a core package, `policy.json`
and the docs. The check already forbids a core package whose name
starts with another layer's prefix, so a name without a prefix always means
core.

## Consequences

- The npm names of 0.1.0 change from the earlier `@halonicjs/integration-kit`
  and `@halonicjs/testing-integration` to `@halonicjs/adapters/integration-kit`
  and `@halonicjs/testing/integration`. Neither old name was ever approved on
  npm.
- `tooling/publish` today builds one npm package from one folder with one
  subpath. It learns to build one package from several folders, and
  `published` in `tooling/check/policy.json`, the release workflow and the
  READMEs follow (HAL-5213). Until that lands the code still carries the old
  names.
- No internal package is renamed and no folder moves.
- A new subpath is a decision: it promises a stable API, so it needs an
  entry in the layer's publish setup and a release approved by the board. A
  new internal package needs neither.
- Readers of the code see internal names; users of npm see the layer
  packages. A package's README example imports its published subpath, which
  the `readme-examples` rule checks.
- `core` stays a layer name. When the core package is built, `core` is added
  to the names a core package folder may not have, next to `root` and
  `host`.
