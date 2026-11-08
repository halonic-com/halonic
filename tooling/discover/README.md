# @halonicjs/tooling-discover

Generates the registration files and keeps the Studio's feature list in
`apps/studio/package.json` correct. Also scaffolds new packages
and shows who else is working on a package.

- **Layer:** tooling
- **Owner:** mateo
- **Commands:**
  - `pnpm discover` writes `apps/studio/src/generated/features.ts` (gitignored). Turbo runs it as the `codegen` task before every typecheck, test and build.
  - `pnpm discover --fix` also rewrites the feature list; run `pnpm install` after.
  - `pnpm discover --check` changes nothing and fails if the list is out of date.
  - `pnpm new package <layer>/<name> --owner <agent> [--purpose "<one line>"]` and `pnpm new feature <name> --owner <agent> [--purpose "<one line>"]` create an empty package or feature, with its `AGENTS.md` written from `templates/package-AGENTS.md`. Without `--purpose` the file holds `TODO: one-line purpose`, and `pnpm check` fails until you replace it.
  - `pnpm who-touches [<package>] [--repo <owner/name>]` lists the open pull requests that change a package. It reads GitHub's public REST API, so it needs no sign-in; set `GH_TOKEN` for the higher rate limit. A short name that fits several packages (`runtime`) lists them, so you can pick the full name.
