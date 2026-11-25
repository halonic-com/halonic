# plugin-build.version

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985; HAL-17986

The plugin builder shall give a build the version asked for, otherwise the previous build's version with its minor number raised and its patch number reset, otherwise `0.1.0`, and if a version is not strict `x.y.z` (numbers without leading zeros, at most 9 digits each, no `v`, pre-release or build part), then it shall refuse it.

## Examples

- Given the version `2.0.0` asked for and a previous build `0.3.4`, then the version is `2.0.0`.
- Given no version asked for and a previous build `0.3.4`, then the version is `0.4.0`.
- Given neither, then the version is `0.1.0`.
- Given the version `v1.0.0`, `1.0` or `1.0.0-beta.1` asked for, then it is refused.
