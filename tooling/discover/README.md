# @halonicjs/tooling-discover

Generates the registration files and keeps the Studio's feature list in
`apps/studio/package.json` correct (plan 5.3). Also scaffolds new packages.

- **Layer:** tooling
- **Owner:** mateo
- **Commands:**
  - `pnpm discover` writes `apps/studio/src/generated/features.ts` (gitignored). Turbo runs it before every typecheck, test and build.
  - `pnpm discover --fix` also rewrites the feature list; run `pnpm install` after.
  - `pnpm discover --check` changes nothing and fails if the list is out of date.
  - `pnpm new package <layer>/<name> [--owner <agent>]` and `pnpm new feature <name> [--owner <agent>]` create an empty package or feature that passes every check.
