# Decision: the layer table lets the CLI ship the Paperclip runtime, and tooling dev-depend on target runtimes

- Task: HAL-17949
- Approval: Liam's decision on HAL-17993 (option A, narrowed), following his layout decision on HAL-17985 (the plugin runtime is a generic target package that the CLI's plugin builder ships); signed in review of the security PR. It changes files under `tooling/check/`, which is part of the requirement guard, so it may need both guardians' signatures (Liam and Julian)
- Kind: internal

## What changes

- `check.cli-never-uses-deploy-targets`: the `halonic` CLI may also use `@halonicjs/target-paperclip-runtime`. The plugin builder (`halonic build paperclip-plugin`, HAL-17950) copies that runtime's `worker.js` into every plugin it makes and reads its action list, so the CLI has to ship it. Every other target package, a Paperclip `deploy` or `harness` package included, is still refused. In `layer-table.ts`, `targetShippedWithCli` becomes the list `targetsShippedWithCli`, and the refusal names the Paperclip runtime too. Its first words stay the same.
- New `check.tooling-dev-uses-target-runtimes`: a tooling package may take a target's `runtime` package as a dev dependency, and nothing else outside tooling. `tooling/paperclip` needs this to test the runtime against today's Agent tools. A runtime dependency on a target runtime, and a dev dependency on an app or a Studio package, are still refused.

- `tooling/check/policy.json`: `extraExports` lists `./actions` for `@halonicjs/target-paperclip-runtime`, the action list the plugin builder reads without the runtime's code (Liam, HAL-17985).

No test was weakened or skipped. The CLI rule gets one new example with an allowed and a refused case. The tooling rule gets three.

## Why

- **The CLI edit** keeps HAL-7114's reason intact: users still install only the deploy targets they use. The Paperclip runtime has no third-party runtime dependencies and no `node:*` imports (the `targetRule` limits for a runtime still apply), so the CLI barely grows.
- **The tooling edit** stays as narrow as the one edge needs. Allowing any package would let tooling dev-depend on apps and Studio packages, which dev-depend on tooling, and that would make workspace cycles.

## Covers

- check.cli-never-uses-deploy-targets
- check.tooling-dev-uses-target-runtimes
- tooling/check/
- tooling/check/policy.json
