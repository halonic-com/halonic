# Decision: the root package may dev-depend on a target's deploy package

- Approval: the reviewer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:B8smrrxpB38LC8Od+NS4j2iiDp65VZOJ1bWSznOI7yOVjFMoTGqDehNIdnmAS27lMz2+2DU2DtvG3iiBi2ciBQ==

## What changes

- `check.tooling-dev-uses-target-runtimes`: the repository's root package (`@halonicjs/root`) may list a target's `deploy` package as a dev dependency. Every other tooling package still may not, and the root still may not take one as a runtime dependency.
- The root `package.json` dev-depends on `@halonicjs/target-cloudflare-deploy` in the next pull request, once this rule is on `main` (the base commit's copy of the rules checks each pull request).

## Why

HAL-18016: `halonic deploy` loads a target by package name (`import("@halonicjs/target-cloudflare-deploy")`), and `apps/cli` never lists one (`check.cli-never-uses-deploy-targets`, board decision HAL-7114). In a clone nothing put the target where Node looks from `apps/cli`, so `pnpm exec node apps/cli/bin/halonic.js deploy web` always said the target isn't installed, even with `--plan`. HAL-12480 deploys from a clone. A root dev dependency puts the target in the root `node_modules`, just as a user's `npm install -g` puts it beside the CLI. The root is never published, and no package depends on it, so this makes no cycle and ships nothing to users. I chose this over a path in an environment variable, which would let the CLI load code from any folder, and over a pnpm hoisting pattern, which would do the same thing less visibly.

## Tests

`tooling-dev-targets.test.ts`: the root with the Cloudflare deploy package as a dev dependency passes; as a runtime dependency, or as `tooling/paperclip`'s dev dependency, it fails.

## Covers

- check.tooling-dev-uses-target-runtimes
- tooling/check/
