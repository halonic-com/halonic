# Dependencies

Adding a dependency is a decision, not a side effect.

1. **Core uses no external code**, except the two libraries the user
   approved on 8 Nov 2026: `zod` and `yaml` (see below). Write everything
   else in-house, usually in `core/std`.
2. **Outside-world libraries** (model providers, MCP, Google, the OS
   keychain, git, password hashing) live in exactly one adapter each.
3. **React, Tauri, Vite and the approved UI libraries** live only in
   `packages/studio/*`, `apps/studio` and `apps/docs`.
4. **Dev tooling** (compiler, test runner, linter, build cache) goes in
   `devDependencies` and never ships. A testing package that wraps it, such
   as `testing/spec` wrapping Vitest, also lists it in `peerDependencies`:
   the package using it brings its own copy.

## The approved libraries and their wrappers

The user approved five libraries on 8 Nov 2026. Each one sits behind our own
thin package. **Only that package imports the library;** everything else uses
the wrapper, so the rest of the code never depends on the library directly.

| Library                | Only in                          | Everyone else uses                                                                   |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `zod`                  | `core/schema-kit`, `core/format` | `@halonicjs/schema-kit`                                                              |
| `yaml`                 | `core/yaml`                      | `@halonicjs/yaml`                                                                    |
| `@noble/hashes`        | `adapters/password-scrypt`       | the `PasswordHasher` port (SHA-256 comes from the hashing port, backed by WebCrypto) |
| `remark`, `remark-gfm` | `studio/kit`                     | the Markdown view in `@halonicjs/studio-kit`                                         |
| `react-data-grid`      | `studio/kit`                     | the data grid in `@halonicjs/studio-kit`                                             |

`zod` and `yaml` are the only **core exceptions** (`"category":
"core-exception"`). The check lets a core package import one only when the
entry names that package exactly; a `*` pattern is rejected. Anywhere else,
it tells you what to use instead:

> `@halonicjs/workflow uses "zod". "zod" is allowed only in
> @halonicjs/schema-kit and @halonicjs/format. Use @halonicjs/schema-kit for
> validation, or move this code into an adapter. See
> docs/guides/dependencies.md.`

A new core exception needs the user's approval, not only Liam's.

## Cloud runtime bundles

What runs at a cloud provider (the Cloudflare Worker now, the container
image later) carries **only our own code, the provider's own code and
`zod`**. The runtime never reads YAML: `halonic deploy` ships the workspace as
checked JSON. Passwords are checked with WebCrypto, not `@noble/hashes`.

- `"cloudRuntime": true` in `dependencies.json` puts a library on the
  runtime list. Today only `zod` has it, and a test pins that. Only core
  exceptions and outside-world libraries can carry it, and only with the
  user's approval. An outside-world library qualifies only if it brings no
  other packages with it.
- What each provider supplies itself is in `cloudRuntimes` in
  `tooling/check/policy.json`: its own npm packages (for Cloudflare,
  `wrangler`'s templates and `@cloudflare/*`) and the modules its runtime
  provides (`cloudflare:*`, `node:*`).
- **`pnpm check:bundle --target cloudflare <metafile>`** runs after each
  runtime build. It reads the bundler's metafile (`--metafile`), so it sees
  every file that went in, including whatever an approved library pulls
  with it, and fails on any package not allowed above, and on any module
  left external that the provider doesn't supply.

## Adding one

1. Add an entry to `tooling/check/dependencies.json`:

   ```json
   "some-library": {
     "category": "outside-world",
     "allowedIn": ["@halonicjs/adapter-some-service"],
     "layers": ["adapters"],
     "reason": "Why we need it and what writing it ourselves would cost."
   }
   ```

   `category` is `core-exception`, `outside-world`, `studio-framework` or `dev-tooling`.
   `allowedIn` lists package names; `*` matches any text. `layers` lists
   the layers it may be used in. A package may use it only when both its
   name and its layer match. The category limits both: `outside-world`
   names exactly one adapter (no `*`) with `"layers": ["adapters"]`, and
   `studio-framework` lists only `studio` and `apps`, and `core-exception`
   only `core`. The optional `useInstead` names the wrapper other packages
   use; the check puts it in its error message.
2. Add the version once to the `catalog:` in `pnpm-workspace.yaml`, as a
   plain version: `1.2.3`, `^1.2.3` or `~1.2.3`. Aliases (`npm:other@1`),
   URLs, tags and other protocols fail the check, because they can install
   a different package under an approved name.
3. Use `"some-library": "catalog:"` in the package's `package.json`.
4. Liam approves it in the pull request; anything outside the four
   categories also needs the user's approval.

## Install hardening

`pnpm-workspace.yaml` sets these for every install:

- **`minimumReleaseAge: 4320`**: a release must be 3 days old. For an
  urgent security fix, add the package to `minimumReleaseAgeExclude` in its
  own pull request and remove it again afterwards.
- **`allowBuilds`**: install scripts run only for listed packages; an
  unlisted one fails the install.
- **`blockExoticSubdeps`**: no git or tarball URLs anywhere in the tree.
- **`trustPolicy: no-downgrade`**: the install fails when a package loses
  its trusted-publisher status, a common sign of a hijack.
- **`registries`**: the `@halonicjs` scope always comes from npm.

`packageExtensions`, `patchedDependencies` and named `catalogs:` in
`pnpm-workspace.yaml`, and `overrides`, `resolutions` or `pnpm` in a
`package.json`, fail the check: they change the tree around the catalog
and this list.

`overrides:` in `pnpm-workspace.yaml` is allowed for one case: a security
fix for one parent's copy of a package. List it in
`tooling/check/overrides-allowed.json` in its own pull request, with the
advisory, a reason and a `remove-when` condition. The check holds each
entry to these rules:

- The key is `parent>child`. A bare `zod:` would rewrite every copy in the
  tree and fails.
- The value is the catalog version of the child (or `catalog:`), so the
  catalog stays the one place for versions.
- An entry with no matching override fails, so a fix that is no longer
  needed gets removed.

Internal dependencies always use `"workspace:*"`. A version range would let
pnpm look the name up on the registry. Add one with
`pnpm add @halonicjs/<name> --workspace`, which writes `"workspace:*"`. A
plain `pnpm add @halonicjs/<name>` writes `"workspace:^"`, which
`pnpm check` rejects; pnpm 12 has no setting that changes this.

Never edit `pnpm-lock.yaml` by hand. On a conflict, take either side and
run `pnpm install`.
