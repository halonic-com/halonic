# sandbox-srt.check-fix

- Status: active
- Since: 0.1.0
- Source: HAL-5393; design section 2.6 on HAL-3779; `ports.sandbox-check-fix` (docs/adr/2026-11-12-sandbox-check-fix-data.md); the AppArmor profile CI loads on Ubuntu 24.04 (HAL-6030)

When the sandbox-srt adapter refuses with `bubblewrap-missing`, `linux-tools-missing` or `ripgrep-missing`, it shall name the fix as one install of every package that is missing (`bubblewrap`, `socat`, `ripgrep`) with the package manager it finds on this machine (`apt`, `dnf`, `pacman` or `zypper` on Linux, the first found on `PATH`; `brew` on macOS), or `null` when it finds none. When it refuses with `user-namespaces-restricted`, it shall name the AppArmor profile for `/usr/bin/bwrap` alone, at `/etc/apparmor.d/bwrap`, with the text CI loads on Ubuntu 24.04, and never the machine-wide setting. Only the package manager shall come from the machine; the packages, the program, the path and the profile are the adapter's own. Finding the package manager shall start no program.

## Examples

- Given Fedora without bubblewrap and without `socat`,
  when it is checked,
  then the reason is `bubblewrap-missing` and the fix installs `bubblewrap` and `socat` with `dnf`.
- Given Debian with bubblewrap but without ripgrep,
  when it is checked,
  then the fix installs `ripgrep` with `apt`.
- Given a Linux machine where none of `apt-get`, `dnf`, `pacman` or `zypper` is on `PATH`,
  when bubblewrap is missing,
  then the fix's package manager is `null` and it still names `bubblewrap`.
- Given macOS without ripgrep, where Homebrew is in `/opt/homebrew/bin` but not on `PATH`,
  when it is checked,
  then the fix installs `ripgrep` with `brew`.
- Given Ubuntu 24.04 where AppArmor stops bubblewrap from creating a user namespace,
  when it is checked,
  then the fix is the AppArmor profile for `/usr/bin/bwrap`, the same text as in `ci.yml`.
- Given a refusal for any other reason, such as `container`,
  when it is checked,
  then it names no fix.
