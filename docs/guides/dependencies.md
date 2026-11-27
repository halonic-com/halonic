# Dependencies

Adding a dependency is a decision, not a side effect.

1. **Core uses no external code**, except the two libraries the user
   approved on 8 Nov 2026: `zod` and `yaml` (see below). Write everything
   else in-house, usually in `core/std`.
2. **Outside-world libraries** (model providers, MCP, Google, the OS
   keychain, git, password hashing) live in exactly one adapter each.
3. **React, Tauri, Vite and the approved UI libraries** live only in
   `packages/studio/*` and `apps/studio`.
4. **Dev tooling** (compiler, test runner, linter, build cache) goes in
   `devDependencies` and never ships. A testing package that wraps it, such
   as `testing/spec` wrapping Vitest, also lists it in `peerDependencies`:
   the package using it brings its own copy. When one adapter really has to
   ship a dev-tooling library, its entry names that adapter in `runtimeIn`
   (one exact `@halonicjs/adapter-<name>`, also in `allowedIn`), and only that
   adapter may list it in `dependencies` and import it from its source.

## The approved libraries and their wrappers

The user approved five libraries on 8 Nov 2026. Each one sits behind our own
thin package. **Only that package imports the library;** everything else uses
the wrapper, so the rest of the code never depends on the library directly.

| Library | Only in | Everyone else uses |
| --- | --- | --- |
| `zod` | `core/schema-kit`, `core/format` | `@halonicjs/schema-kit` |
| `yaml` | `core/yaml` | `@halonicjs/yaml` |
| `@noble/hashes` | `adapters/password-scrypt` | the `PasswordHasher` port (SHA-256 comes from the hashing port, backed by WebCrypto) |
| `remark`, `remark-gfm` | `studio/kit` | the Markdown view in `@halonicjs/studio-kit` |
| `react-data-grid` | `studio/kit` | the data grid in `@halonicjs/studio-kit` |

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

What runs at a cloud provider (a Cloudflare Worker, later a container image)
carries **only our own code, the provider's own code and `zod`**. The runtime
never reads YAML: the deploy step ships the workspace as checked JSON.
Passwords are checked with WebCrypto, not `@noble/hashes`. The Cloudflare runtime
is `packages/targets/cloudflare/runtime`, and `tooling/publish/src/worker-bundle.ts`
builds it. The test harness, `packages/targets/cloudflare/testing`, never ships.

- `"cloudRuntime": true` in `dependencies.json` puts a library on the
  runtime list. Today only `zod` has it, and a test pins that. Only core
  exceptions and outside-world libraries can carry it, and only with the
  user's approval. An outside-world library qualifies only if it brings no
  other packages with it.
- What each provider supplies itself is in `cloudRuntimes` in
  `tooling/check/policy.json`: its own npm packages (for Cloudflare,
  `wrangler`'s templates and `@cloudflare/*`) and the modules its runtime
  provides (`cloudflare:*`, `node:*`).
- **`pnpm check:bundle --target cloudflare <metafile>`** checks a runtime
  build. Two callers run it: `buildWorkerBundle` (`tooling/publish`) runs
  it on the Cloudflare Worker's metafile on every build, and a test runs
  it on an integration bundle (`tooling/publish/src/pack.test.ts`). It
  reads the bundler's metafile (`--metafile`), so it covers every file that
  ships, meaning every file with bytes in the script, including whatever an
  approved library pulls with it. A file the bundler parsed but dropped
  (0 bytes in every output) never runs, so it isn't checked. If any output
  in the metafile doesn't list its files, the check fails closed and checks
  every file the bundler parsed. It fails on any package not allowed above,
  and on any module left external that the provider doesn't supply. The
  Worker build fails on any finding, so the real Worker can't carry
  anything else.
- Core packages the runtime imports say `"sideEffects": false` in their
  `package.json`, so the bundler can drop the modules the runtime doesn't
  use. Mark a package that way only if none of its modules does work at
  import time (a registration, a top-level call with an effect, a polyfill).

## Container images

A Dockerfile under `packages/` builds an image that runs at a cloud provider, so its contents
follow the cloud-runtime rule above: **only the board approves a new image artifact or a version
bump**. Each one has an entry under `images` in `tooling/check/dependencies.json`, keyed by the
Dockerfile's path from the repo root:

- `base`: the full `FROM` reference, digest included (`name:tag@sha256:<digest>`), and a `reason`.
- `artifacts`: one entry per downloaded file, with `version`, `sha256`, `url`, `reason` and
  `approvedOn`, the task holding the board's approval. A file that comes with another one, such as
  a library's own dependencies, may give `partOf: "<name>"` instead of repeating its reason.
- `aptPackages` (only if the Dockerfile runs `apt-get install`): each Debian package's `name`
  and `reason`.

The `images` rule of `pnpm check` fails on a Dockerfile under `packages/` without an entry, a
`FROM` without a digest or other than `base`, a remote `ADD` without `--checksum=sha256:` or not
listed by both URL and sha256, a listed artifact the Dockerfile no longer downloads, a
`COPY --from=` or `RUN --mount=…,from=` that names an image instead of an earlier stage, and a
`RUN` (heredoc bodies and `ONBUILD` included) that fetches around the checksums or installs an
unlisted Debian package. Dockerfiles under `infra/` and `.github/` aren't covered yet. A
`Containerfile` counts as a Dockerfile. An `ADD` whose source holds a variable (`ADD ${URL} /x`)
fails too: the check can't read what the variable holds, so write the URL out.

The fetch list (`curl`, `wget`, `git clone`, `npx`, `npm exec`, `npm install` without
`--offline`, `pnpm`/`yarn`/`bun` add or install, `pip`, `gem`, `cargo` and `go` install,
`apk add`, `dpkg -i`) catches mistakes, not a determined author: the reviewer still reads every
`RUN`. To unpack checked npm tarballs, use `npm install --offline --ignore-scripts`, so nothing
from them runs at build time.

To bump a version, change the `ADD` line and its entry together, and set `approvedOn` to the task
with the board's yes. The reviewer checks that the task really approves that version.

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
- **`allowBuilds`**: install scripts run only for packages set to `true`
  here; an unlisted one fails the install. Today every entry is `false`, so
  none runs.
- **`blockExoticSubdeps`**: no git or tarball URLs anywhere in the tree.
- **`trustPolicy: no-downgrade`**: the install fails when a package loses
  its trusted-publisher status, a common sign of a hijack.
- **`registries`**: the `@halonicjs` scope always comes from npm.

`packageExtensions` and named `catalogs:` in `pnpm-workspace.yaml`, and
`overrides`, `resolutions` or `pnpm` in a `package.json`, fail the check:
they change the tree around the catalog and this list.

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

`patchedDependencies:` in `pnpm-workspace.yaml` is allowed only for a patch
listed in `tooling/check/patches-allowed.json`, again in its own pull
request, with a reason and a `remove-when` condition. Make the patch with
`pnpm patch` and `pnpm patch-commit`. The check holds each patch to these
rules:

- The key is `name@version` with the catalog version, so a new version of
  the package needs its patch reviewed again.
- The value is the file the entry lists, directly in `patches/`.
- The file's SHA-256 (with `\n` line ends) is the one the entry lists, so a
  changed patch needs a changed list. CI reads the list from the base
  commit, so the entry merges before its patch.
- An entry with no matching patch is a warning, so the entry can land
  first. Remove it once the patch is gone.

To change a listed patch, approve the new file first, in its own pull
request: put its hash in the entry's `next-sha256`, next to the `sha256` of
the patch in use, and update the reason. Either hash passes. Then the pull
request that changes the patch moves the new hash to `sha256` and removes
`next-sha256`. Checked against the base commit's list, it gets a warning
that its patch is the next one, which is expected.

Internal dependencies always use `"workspace:*"`. A version range would let
pnpm look the name up on the registry. Add one with
`pnpm add @halonicjs/<name> --workspace`, which writes `"workspace:*"`. A
plain `pnpm add @halonicjs/<name>` writes `"workspace:^"`, which
`pnpm check` rejects; pnpm 12 has no setting that changes this.

Never edit `pnpm-lock.yaml` by hand. On a conflict, take either side and
run `pnpm install`.
