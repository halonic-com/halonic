# format.deployments-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a `deployments.yaml`, the format shall accept the old `Deployments` schema with its defaults (`host: local`, `stage: development`, `shadow: false`), refuse a file that names no deployment, refuse a deployment id over 64 characters or named after a Windows device (`con`, `prn`, `aux`, `nul`, `com0`–`com9`, `lpt0`–`lpt9`) with a message that says which rule it breaks, and refuse a `default` that is not one of the listed deployments, with the problem at `default`. The old loader made the last check after loading, without a line; it now belongs to the file and has one. A deployment id names its runs folder in the profile (`deployments/<id>/runs`), so it must be a folder name on every system, and the 64-character cap keeps that path under Windows' 260-character limit; the old schema allowed any length and the device names.

## Examples

- Given one deployment `laptop` with only a name, when it is parsed, then it gets `host: local`, `stage: development` and `shadow: false`.
- Given `deployments: {}`, when it is parsed, then it fails with `custom` at `deployments`.
- Given `default: prod` and only `laptop` listed, when it is parsed, then it fails with `default-deployment-not-listed` at `default`, line 1.
- Given `default: constructor`, when it is parsed, then it fails the same way: names from an object's prototype are not deployments.
- Given a deployment id of 64 characters, when it is parsed, then it is accepted.
- Given a deployment id of 65 characters, when it is parsed, then it fails with `invalid_key` at that deployment, and the message says to use at most 64 characters.
- Given a deployment named `aux` (or `con`, `nul`, `com1`, …), when it is parsed, then it fails with `invalid_key` at that deployment, and the message says Windows keeps the name for a device. `console`, `com10` and `nul-1` are accepted.
