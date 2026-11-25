# Decision: listed tooling packages may use core packages (`toolingUsesCore`)

- Task: HAL-18010
- Approval: Liam decided on HAL-18009 (option 1) that the Agent tools plugin may embed the Halonic engine through a `toolingUsesCore` exception in the layer table; HAL-18010 specifies it
- Kind: internal

## What changes

- `tooling/check/policy.json`: a new field, `toolingUsesCore`, listing
  `@halonicjs/tooling-paperclip`. It is read strictly like `apiTypes` (optional, a list of
  strings). This is a change to `policy.json` outside `extraExports`, so it reaches a trust root
  and needs both guardians' signatures.
- `tooling/check/src/rules/layer-table.ts`: a listed tooling package may use core packages, in
  runtime and dev edges and in imports. Adapters, targets and Studio packages stay forbidden for
  it. Unlisted tooling packages keep today's rule.
- `tooling/check/src/rules/packages.ts`: an entry that isn't a package in the repo, or isn't a
  tooling package, fails the `packages` check, so the list can't go stale quietly.
- New requirement `check.tooling-uses-core` and its test. The fixture policy empties the new
  field like `apiTypes`, because it names a real package a fixture may not have. No test is
  weakened.
- Docs: the layer table in `docs/guides/checks.md` and `CONTRIBUTING.md`.

## Why

The Agent tools plugin's workflow host is to run on our own engine (HAL-17774). Without this,
the layers check refuses every edge from `tooling/paperclip` to a core package. The queue runs
the policy rules from the base's copy, so this lands first.

## Security

The exception widens what one tooling package may import, and only towards core, which has no
third-party code and no Node APIs. Tooling never ships, and tooling packages stay dev-only for
every other layer.

## Covers

- tooling/check/
