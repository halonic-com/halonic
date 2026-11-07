# Dependencies

Adding a dependency is a decision, not a side effect (plan 7.1).

1. **Core uses no external code.** Write it in-house, usually in `core/std`.
2. **Outside-world libraries** (model providers, MCP, Google, the OS
   keychain, git) live in exactly one adapter each.
3. **React, Tauri, Vite and the approved UI libraries** live only in
   `packages/studio/*`, `apps/studio` and `apps/docs`.
4. **Dev tooling** (compiler, test runner, linter, build cache) goes in
   `devDependencies` and never ships.

## Adding one

1. Add an entry to `tooling/check/dependencies.json`:

   ```json
   "some-library": {
     "category": "outside-world",
     "allowedIn": ["@halonicjs/adapter-some-service"],
     "reason": "Why we need it and what writing it ourselves would cost."
   }
   ```

   `category` is `outside-world`, `studio-framework` or `dev-tooling`.
   `allowedIn` lists package names; `*` matches any text.
2. Add the version once to the `catalog:` in `pnpm-workspace.yaml`.
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

Internal dependencies always use `"workspace:*"`. A version range would let
pnpm look the name up on the registry.

Never edit `pnpm-lock.yaml` by hand. On a conflict, take either side and
run `pnpm install`.
