# @halonicjs/tooling-discover

Generates the registration files and keeps the Studio's feature list in
`apps/studio/package.json` correct (plan 5.3).

- **Layer:** tooling
- **Owner:** mateo
- **Commands:**
  - `pnpm discover` writes `apps/studio/src/generated/features.ts` (gitignored). Turbo runs it before every typecheck, test and build.
  - `pnpm discover --fix` also rewrites the feature list; run `pnpm install` after.
  - `pnpm discover --check` changes nothing and fails if the list is out of date.
