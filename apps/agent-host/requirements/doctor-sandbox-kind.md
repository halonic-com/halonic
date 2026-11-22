# agent-host.doctor-sandbox-kind

- Status: active
- Since: unreleased
- Source: HAL-16290 (from words check C691 row 69 on HAL-16283; first-run-progress 4.2, "Ready · Seatbelt (or bubblewrap)", "CLI doctor, as written")

When the agent host answers Studio's check of this computer and the sandbox is ready, the agent host shall name on the Sandbox line, as `sandboxKind`, the kind of sandbox it runs, as an id from the system it runs on (`sandboxKindOf` in `adapter-doctor-node`, the table `halonic doctor` names its own from): `bubblewrap` on Linux, inside Halonic's WSL distro too, `seatbelt` on macOS and `windows` for srt's Windows mode. It shall name no kind on a Sandbox line that isn't ready, on any other line, or on a system srt doesn't run on.

## Examples

- Given a host inside Halonic's WSL distro whose sandbox is ready,
  then its Sandbox line has `sandboxKind: bubblewrap`, and no other line has a `sandboxKind`.
- Given a host on Windows itself whose sandbox is ready,
  then its Sandbox line has `sandboxKind: windows`, which Studio words as "Sandbox for Windows", the name `halonic doctor` prints there.
- Given a sandbox that can't start,
  then the Sandbox line has no `sandboxKind`.
