# @halonicjs/tooling-check

Our own repo checks. So far: package manifests, layers, dependencies and
names; the feature list, file size and lockfile rules and the
personal-terms guard follow in the next pull requests.

- **Layer:** tooling
- **Owner:** mateo
- **Commands:** `pnpm check [rule …]`
- **Settings:** `policy.json` (core order, published packages, file size),
  `dependencies.json` (approved external dependencies)

What each rule checks, and how to fix a failure, is in
[docs/guides/checks.md](../../docs/guides/checks.md).

Uses `@typescript/typescript6` for the parser API until TypeScript 7.1
ships its own (D9); then that dependency goes.
