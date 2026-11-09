# mutation.parity-fixtures-in-sandbox

- Status: active
- Since: 0.1.0
- Source: HAL-1574

While the mutation runner runs Stryker on a package, it shall set `HALONIC_PARITY_FIXTURES` to the shared parity fixtures folder in the repo, so a test that reads those fixtures finds them although Stryker runs it from a copy of the package.

## Examples

- Given the repo at `/repo`, then the run's environment has `HALONIC_PARITY_FIXTURES` set to `/repo/packages/testing/parity/fixtures`.
- Given this repo, then that folder exists.
