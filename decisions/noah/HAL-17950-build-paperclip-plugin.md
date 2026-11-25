# Decision: `@halonicjs/plugin-build` comes before `@halonicjs/app` in the core order

- Task: HAL-17950
- Approval: Liam's decision on HAL-17985 (the plugin build service goes in `@halonicjs/app` and uses the new core package `@halonicjs/plugin-build`); signed in review of the security PR. It changes a file under `tooling/check/`, which is part of the requirement guard
- Kind: internal

## What changes

- `tooling/check/policy.json`: in `coreOrder`, `@halonicjs/plugin-build` moves from the end of the list to just before `@halonicjs/app`. A core package may use only the core packages listed before it, and the plugin build service in `@halonicjs/app` (`buildWorkspacePlugin`) uses `@halonicjs/plugin-build`. Nothing else in the file changes.

No test was weakened or skipped, and no rule of the check changes.

## Why

`@halonicjs/plugin-build` uses only `@halonicjs/std`, `@halonicjs/schema-kit` and, from this pull request, `@halonicjs/format`, which are all listed before `@halonicjs/workspace`. Placing it right after `@halonicjs/workspace` keeps the list free of cycles: nothing listed before it uses it.

## Covers

- tooling/check/
- tooling/check/policy.json
