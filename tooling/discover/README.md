# @halonicjs/tooling-discover

Generates the registration files and keeps the Studio's feature list in
`apps/studio/package.json` correct (plan 5.3). Also scaffolds new packages
and shows who else is working on a package.

- **Layer:** tooling
- **Owner:** mateo
- **Commands:**
  - `pnpm discover` writes `apps/studio/src/generated/features.ts` (gitignored). Turbo runs it as the `codegen` task before every typecheck, test and build.
  - `pnpm discover --fix` also rewrites the feature list; run `pnpm install` after.
  - `pnpm discover --check` changes nothing and fails if the list is out of date.
  - `pnpm new package <layer>/<name> --owner <agent>` and `pnpm new feature <name> --owner <agent>` create an empty package or feature that passes every check. Adapters also take `--runtime <node | web | workers | any>`; target packages are `targets/<target>/<runtime | deploy | testing>`. The TypeScript preset follows from the layer and the runtime.
  - `pnpm who-touches [<package>] [--repo <owner/name>]` lists the open pull requests that change a package. It reads GitHub's public REST API, so it needs no sign-in; set `GH_TOKEN` for the higher rate limit. A short name that fits several packages (`runtime`) lists them, so you can pick the full name.
