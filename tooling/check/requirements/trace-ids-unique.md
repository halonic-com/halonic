# check.trace-ids-unique

- Status: active
- Since: 0.1.0
- Source: HAL-107

If the same requirement ID is in two requirement files, then the trace check shall fail on both and name the other file.

## Examples

- Given `routines.runs-on-schedule` in both `packages/core/routines` and `packages/studio/features/routines`,
  when the trace check runs,
  then it fails on both files, each naming the other.
