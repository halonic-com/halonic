# ports.sandbox-check-reason

- Status: active
- Since: 0.1.0
- Source: HAL-1706; board decision on HAL-1601 (proposal 3, "No sandbox, no run" with the reason and the fix); `Sandbox` port v3; the version 6 codes from HAL-5389 (docs/adr/2026-11-11-pluggable-sandbox-layer.md)

The `Sandbox` port shall say, when the sandbox can't start, why as one code from a closed list that the port names (`windows`, `container`, `not-supported`, `blocked-by-policy`, `virtualisation-off`, `wsl-missing`, `restart-needed`, `distro-missing`, `setup-conflict`, `setup-needed`, `user-namespaces-restricted`, `bubblewrap-missing`, `linux-tools-missing`, `sign-in-needed` and `other`, in the order their fixes come), and `null` when it can, so Studio and the CLI can word the refusal and its fix without reading the adapter's sentences.

## Examples

- Given a check on Ubuntu 24.04 with user namespaces restricted,
  when the adapter reports it,
  then `ok` is false and `reason` is `user-namespaces-restricted`.
- Given srt on Windows without its one-time administrator setup,
  when the adapter reports it,
  then `ok` is false and `reason` is `setup-needed`, not `windows`, because srt has a Windows mode.
- Given a check that works,
  when the adapter reports it,
  then `ok` is true, `reason` is `null` and `missing` is empty.
- Given an adapter that returns a reason not on the list, such as `no-kernel`,
  when it is compiled,
  then it doesn't compile.
