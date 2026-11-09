# contracts.sandbox-check

- Status: active
- Since: 0.1.0
- Source: HAL-1706; board decision on HAL-1601 (proposal 3); `Sandbox` port v3

Where an adapter implements `Sandbox`, its `check` shall give `ok` with no reason and nothing missing when it can start, and otherwise a reason from the port's closed list plus at least one sentence on what is missing, and an adapter that can't start shall open no session.

## Examples

- Given an adapter whose probe says bubblewrap is missing,
  when `check` is called,
  then `ok` is false, `reason` is a listed code such as `bubblewrap-missing` and `missing` has a sentence.
- Given an adapter that returns the reason `no-kernel`,
  when the suite runs,
  then it fails and names the reason.
- Given an adapter that can't start,
  when `open` is called,
  then it rejects, and nothing runs without the fence.
