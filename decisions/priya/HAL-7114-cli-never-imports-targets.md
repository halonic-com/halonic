# Decision: the `halonic` CLI never uses a deploy target; it loads one by name

- Approval: [HAL-7114](/HAL/issues/HAL-7114) (the board's answer of 12 Nov on where deploy targets live). Liam approves this note in review of this PR.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DVr3W5J+wbbVJH55WAtWWcvnEQp5wWfwqw1b938DJW7riIzz1Nu2o1mos/77luCeCp2YplsDJcKYT80oNi3NDQ==
- Task: HAL-7114

## What changes

- New requirement `check.cli-never-uses-deploy-targets`: the layer table gets one rule for
  `apps/cli`. The CLI may list and import `@halonicjs/target-node-runtime` (the runtime behind
  `halonic serve`) and a target's `testing` package in its tests, but no other target package, in
  any dependency field, `devDependencies` included. Other apps are unchanged.
- `tooling/check/src/rules/layer-table.ts` adds the rule; `src/test/targets.test.ts` tests it
  (five cases; three of them fail without the rule).
- The layer tables in `AGENTS.md`, `CONTRIBUTING.md` and `docs/guides/checks.md` say so.

Nothing on `main` breaks: there is no target package yet, and the CLI uses none.

## Why

The board decided on HAL-7114 that deploy targets stay in this repo, each as its own package,
with a CI rule that the CLI core never imports a target, so users install only the targets they
use. The repo already gives each target its own packages (`packages/targets/<target>/deploy`,
`runtime` and `testing`, named `@halonicjs/target-<target>-<kind>`), and the layer table already
keeps core, adapters and the host away from targets. What was missing is the CLI: as an app it may
use any package, so nothing stopped `halonic` from depending on the Cloudflare deploy package and
installing it for everyone. The Node runtime is the exception, because `halonic serve` is part of
the CLI.

`devDependencies` count too, even though users don't install them, to keep the rule as simple as
the board's wording. Tests of a target's deploy step belong in that target's own package.

## Covers

- check.cli-never-uses-deploy-targets
- tooling/check/
