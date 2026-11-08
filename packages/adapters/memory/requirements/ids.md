# adapter-memory.ids

- Status: active
- Since: 0.1.0
- Source: HAL-114; old `784f78d:packages/core/util` `fixedIds`

The sequential id generator shall give `<prefix>_<n>`, where `n` counts up from 1 for each prefix on its own, as the old `fixedIds` did, so recorded event logs keep the same ids.

## Examples

- Given a new generator,
  when it is asked for `run`, `run` and `event`,
  then it gives `run_1`, `run_2` and `event_1`.
