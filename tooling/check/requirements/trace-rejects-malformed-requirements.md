# check.trace-rejects-malformed-requirements

- Status: active
- Since: 0.1.0
- Source: HAL-107

If a requirement file is malformed, then the trace check shall fail on that file and line with the reason.

## Examples

- Given a requirement file with "Status: done",
  when the trace check runs,
  then it fails with "Malformed requirement file" and the reason.
