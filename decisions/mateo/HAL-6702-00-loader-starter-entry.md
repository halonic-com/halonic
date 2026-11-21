# Decision: list the CLI's deploy target loader in the process-starts guard

- Task: HAL-6702 (the `halonic deploy` command)
- Approval: the build plan's "Loading by name" row, approved by Liam on HAL-13512; HAL-7114 (the CLI never imports a target package); Liam approves this note in review
- Kind: internal

## What changes

`tooling/check/process-starters.json` gets one entry for `apps/cli/src/deploy-target-loader.ts`,
the file that loads `@halonicjs/target-<host>-deploy` for `halonic deploy` when the loader lands
in halonic#4557. Its one `import()` takes a computed name, which the `process-starts` check
refuses without an entry. It is the same entry as in halonic#4557, split out so it is reviewed
and merged first: CI checks a pull request against the base's list (`docs/guides/checks.md`).

The name is always `@halonicjs/target-<host>-deploy`, and the loader refuses any host that isn't
one lowercase word before it imports anything. So the name is a bare package name, never a path,
and it can't reach a file under a skill's `scripts/` folder. Loading a module starts no process.

No requirement, test or golden file changes. The guard warns that the file doesn't exist yet.
That is expected until halonic#4557 merges.

## Tests

`apps/cli/src/deploy-target-loader.starts.test.ts`, in halonic#4557, points the loader at a
skill's script as a path, as a `../` path and through a host with a slash, and checks that each
is refused, nothing is imported and the script never runs.

## Covers

- tooling/check/
