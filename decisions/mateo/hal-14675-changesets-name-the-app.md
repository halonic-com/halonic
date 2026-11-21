# Decision: every changeset names the app

- Task: HAL-14675
- Approval: Liam asked for this change on HAL-14675 (from HAL-14674); he reviews it and signs this note as the CTO
- Kind: internal

## What changes

- `tooling/check/src/rules/changesets.ts`: a new `changesets` rule in `pnpm check`. It fails a file in `.changeset/` whose front matter names a package other than `@halonicjs/app-studio`, and gives the file and line. Requirement `check.changesets-name-the-app`.
- 54 waiting changesets that named `halonic` (the CLI) or another private package now name `@halonicjs/app-studio`. Each sentence and bump level stays as it was.
- `.changeset/README.md` says the check refuses other package names.

## Why

A dry run of `pnpm version-packages` on `main` showed that `changeset version` deletes a changeset for a package with no `version` without a word, so 53 sentences would have been missing from the next changelog. One `minor` on `@halonicjs/app-agent-host`, which has `"version": "0.0.0"`, would have versioned it to 0.1.0 with a changelog of its own. Only the app's changelog is Halonic's changelog. With the fix, the dry run puts every waiting sentence in `apps/studio/CHANGELOG.md` and changes no other package.

## Tests

No test was skipped or weakened. `changesets.test.ts` covers a changeset that names the app, one that names the CLI (with its line), one that names the app and another package, empty front matter and the README, and the message that says which package to name.

## Covers

- tooling/check/
- check.changesets-name-the-app
