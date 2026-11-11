# ports.sandbox-check-reason

- Status: active
- Since: 0.1.0
- Source: HAL-1706; board decision on HAL-1601 (proposal 3, "No sandbox, no run" with the reason and the fix); `Sandbox` port v3

The `Sandbox` port shall say, when the sandbox can't start, why as one code from a closed list that the port names (`windows`, `container`, `user-namespaces-restricted`, `bubblewrap-missing`, `linux-tools-missing` and `other`), and `null` when it can, so Studio and the CLI can word the refusal and its fix without reading the adapter's sentences.

## Examples

- Given a check on Ubuntu 24.04 with user namespaces restricted,
  when the adapter reports it,
  then `ok` is false and `reason` is `user-namespaces-restricted`.
- Given a check that works,
  when the adapter reports it,
  then `ok` is true, `reason` is `null` and `missing` is empty.
- Given an adapter that returns a reason not on the list, such as `no-kernel`,
  when it is compiled,
  then it doesn't compile.
