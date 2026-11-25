# check.tooling-uses-core

- Status: active
- Since: unreleased
- Source: HAL-18009 (Liam's decision, option 1: the Agent tools plugin runs its workflow host on our own engine); HAL-18010

If a tooling package listed under `toolingUsesCore` in `tooling/check/policy.json` depends on or imports a core package, in a runtime or a dev edge, then the `layers` check shall pass it. If it uses an adapter, a target or a Studio package, or an unlisted tooling package uses a core package, then the `layers` check shall fail. If `toolingUsesCore` names a package that isn't in the repo or isn't a tooling package, then the `packages` check shall fail and name the entry.

## Examples

- Given `@halonicjs/tooling-paperclip` listed under `toolingUsesCore`, depending on and importing `@halonicjs/std`,
  when the check runs,
  then it passes.
- Given the same listed package depending on and importing an adapter or a target package,
  when the check runs,
  then it fails on each edge and import.
- Given an unlisted tooling package depending on and importing `@halonicjs/std`,
  when the check runs,
  then it fails with "tooling packages use only other tooling packages".
- Given `toolingUsesCore` listing a core package, or a name no package in the repo has,
  when the check runs,
  then the `packages` check fails on `tooling/check/policy.json` and names the entry.
