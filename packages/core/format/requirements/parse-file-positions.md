# format.parse-file-positions

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 7.3, D7), ported from 784f78d `sourcePosition` in `packages/core/config/src/workspace.ts`

When `parseFile` finds a problem, it shall give the problem its path, its line and its column: for a schema problem the start of the value at its path, or of the nearest parent that exists, as the old loader did; for a YAML problem where the YAML reader found it; and line 1, column 1 for a file with no data. An empty file is read as an empty map.

## Examples

- Given `temperature: hot` on line 4, when the agent is parsed, then the problem is at `params.temperature`, line 4, column 16.
- Given an alias without `model`, when it is parsed, then the problem points at the alias's map.
- Given an empty `hub.yaml`, when it is parsed, then `id` and `name` are missing at line 1.
- Given Windows line endings, when it is parsed, then lines are counted as with `\n`.
