# ports.sandbox-check-fix

- Status: active
- Since: 0.1.0
- Source: HAL-5393; design section 2.6 on HAL-3779 (the check step names the fix for this machine); plan approved by Liam on HAL-7479 (docs/adr/2026-11-12-sandbox-check-fix-data.md)

When the sandbox can't start, the `Sandbox` port shall let the adapter add what fixes it on this machine as data, not words: either one install of every missing package with the package manager it found (`apt`, `dnf`, `pacman`, `zypper` or `brew`, or `null` when it found none), or an AppArmor profile with the program it covers, the file it goes in and its text. The fix is optional, never set when the sandbox can start, and only advice: Studio and the CLI word it, and no caller runs it on its own.

## Examples

- Given a check on Fedora without bubblewrap and without `socat`,
  when the adapter reports it,
  then `reason` is `bubblewrap-missing` and `fix` is an install with `dnf` of `bubblewrap` and `socat`.
- Given a check on a machine with no package manager Halonic knows,
  when the adapter reports a missing package,
  then `fix` is an install whose `packageManager` is `null`, with the packages still named.
- Given a check on Ubuntu 24.04 with user namespaces restricted,
  when the adapter reports it,
  then `fix` is an AppArmor profile for `/usr/bin/bwrap` alone, not the machine-wide setting.
- Given a refusal from an adapter that knows no fix,
  when it is compiled,
  then it compiles without `fix`.
- Given a check that works, or a fix with a package manager that isn't listed,
  when it is compiled,
  then it doesn't compile.
