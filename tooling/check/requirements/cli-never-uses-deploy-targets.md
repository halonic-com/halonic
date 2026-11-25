# check.cli-never-uses-deploy-targets

- Status: active
- Since: unreleased
- Source: HAL-7114 (board decision, 12 Nov: each deploy target is its own package, and the CLI core never imports one); HAL-16907 (the Node harness wiring the CLI shares with the engine host); HAL-17949 and Liam's decision on HAL-17993 (the Paperclip runtime, whose `worker.js` the CLI's plugin builder copies)

If the `halonic` CLI package (`apps/cli`) lists a target package other than `@halonicjs/target-node-runtime`, `@halonicjs/target-node-harness`, `@halonicjs/target-paperclip-runtime` or a target's `testing` package in any dependency field, or imports one, then the `layers` check shall fail and say that the CLI loads a deploy target by name, so users install only the targets they use.

## Examples

- Given `apps/cli` depending on and importing `@halonicjs/target-node-runtime`,
  when the check runs,
  then it passes.
- Given `apps/cli` depending on and importing `@halonicjs/target-node-harness`,
  when the check runs,
  then it passes.
- Given `apps/cli` depending on and importing `@halonicjs/target-paperclip-runtime`,
  when the check runs,
  then it passes.
- Given `apps/cli` listing `@halonicjs/target-paperclip-deploy` in `dependencies`,
  when the check runs,
  then it fails.
- Given `apps/cli` listing `@halonicjs/target-cloudflare-harness` in `dependencies`,
  when the check runs,
  then it fails.
- Given `apps/cli` listing `@halonicjs/target-cloudflare-deploy` and `@halonicjs/target-cloudflare-runtime` in `dependencies`,
  when the check runs,
  then it fails once for each of them.
- Given `apps/cli` importing `@halonicjs/target-cloudflare-deploy` in a source file,
  when the check runs,
  then it fails on that import.
- Given `apps/cli` listing `@halonicjs/target-cloudflare-deploy` in `devDependencies` only,
  when the check runs,
  then it fails.
- Given another app, such as `apps/studio`, depending on `@halonicjs/target-cloudflare-deploy`,
  when the check runs,
  then this rule doesn't apply.
