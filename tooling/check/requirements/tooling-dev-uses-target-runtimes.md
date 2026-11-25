# check.tooling-dev-uses-target-runtimes

- Status: active
- Since: unreleased
- Source: HAL-17949; Liam's decision on HAL-17993 (option A, narrowed: `tooling/paperclip` tests the Paperclip plugin runtime against today's Agent tools)

When a tooling package lists or imports a package outside the tooling layer, the `layers` check shall pass it only if that package is a target's `runtime` package and the edge is a dev dependency, and otherwise fail and say that tooling packages use only other tooling packages, and that a target's runtime package is allowed as a dev dependency only. A package listed under `toolingUsesCore` may also use core packages, by that rule.

## Examples

- Given `tooling/paperclip` listing `@halonicjs/target-paperclip-runtime` in `devDependencies`,
  when the check runs,
  then it passes.
- Given `tooling/paperclip` listing `@halonicjs/target-paperclip-runtime` in `dependencies`,
  when the check runs,
  then it fails.
- Given `tooling/paperclip` listing the `halonic` CLI in `devDependencies`,
  when the check runs,
  then it fails.
