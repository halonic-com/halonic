# Decision: the CLI may load a deploy target with `import()` on its package name

- Approval: the build plan's "Loading by name" row, approved by Liam on HAL-13512 (HAL-6702); HAL-7114 (the CLI never imports a target package); Liam approves this note in review
- Kind: internal

## What changes

- `tooling/check/process-starters.json` gets an entry (merged first in halonic#4595, because CI checks against the base's list) for `apps/cli/src/deploy-target-loader.ts`. Its one `import()` takes a computed name, which the `process-starts` check refuses without an entry.
- The name is always `@halonicjs/target-<host>-deploy`, and the loader refuses any host that isn't lowercase letters and digits with single hyphens between parts (`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`) before it imports anything. So the name is a bare package name, never a path, and it can't reach a file under a skill's `scripts/` folder.

## Why

The CLI may not list or import a target package (`check.cli-never-uses-deploy-targets`), so users install only the targets they use. Loading by name is how the approved plan gets the Cloudflare target into `halonic deploy`. Loading a module starts no process.

## Tests

`apps/cli/src/deploy-target-loader.starts.test.ts` points the loader at a skill's script as a path, as a `../` path and through a host with a slash, and checks that each is refused, nothing is imported and the script never runs. `deploy-target-loader.test.ts` covers the load, the package that isn't installed, and a package that's broken or doesn't fit the port.

## Covers

- tooling/check/
