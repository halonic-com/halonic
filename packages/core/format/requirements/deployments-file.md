# format.deployments-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a `deployments.yaml`, the format shall accept the old `Deployments` schema with its defaults (`host: local`, `stage: development`, `shadow: false`), refuse a file that names no deployment, and refuse a `default` that is not one of the listed deployments, with the problem at `default`. The old loader made the last check after loading, without a line; it now belongs to the file and has one.

## Examples

- Given one deployment `laptop` with only a name, when it is parsed, then it gets `host: local`, `stage: development` and `shadow: false`.
- Given `deployments: {}`, when it is parsed, then it fails with `custom` at `deployments`.
- Given `default: prod` and only `laptop` listed, when it is parsed, then it fails with `default-deployment-not-listed` at `default`, line 1.
- Given `default: constructor`, when it is parsed, then it fails the same way: names from an object's prototype are not deployments.
