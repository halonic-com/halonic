# sandbox-srt.check

- Status: active
- Since: 0.1.0
- Source: HAL-193 (plan phase 3, v1.17), HAL-1706, HAL-5389 (`Sandbox` port v6), HAL-6518, HAL-6639 (ripgrep on macOS)

The sandbox-srt adapter shall say whether it can start on this machine, and when it can't, give the first listed reason (Windows without srt's one-time setup, inside a container, WSL 1, user namespaces restricted, bubblewrap missing, `socat` or ripgrep missing, other; on macOS, Seatbelt missing and then ripgrep missing) and one sentence saying what is missing, and never open a session in that case. It shall blame user namespaces only when bubblewrap is installed, fails to create one, and AppArmor's `apparmor_restrict_unprivileged_userns` setting is on; when bubblewrap fails otherwise, the reason shall be `other` with bubblewrap's own first line. On Linux it shall say it can start only once srt has started its smallest real sandbox (network namespace and bridge included) and run `true` in it, within 10 seconds, asked once per process; if that fails, the reason shall be `other` with srt's own line.

## Examples

- Given a Linux machine inside Docker with bubblewrap missing,
  when it is checked,
  then the reason is `container`, because it comes first.
- Given a Linux machine where bubblewrap is installed and user namespaces are allowed,
  when it is checked,
  then it can start, with no reason and nothing missing.
- Given a Linux machine where bubblewrap is installed but `socat` or ripgrep is not,
  when it is checked,
  then the reason is `linux-tools-missing`, because srt starts both next to bubblewrap, and the sentence names the missing ones.
- Given Ubuntu 24.04 without bubblewrap, where AppArmor restricts user namespaces,
  when it is checked,
  then the reason is `bubblewrap-missing` only, because bubblewrap's own AppArmor profile lets it through once it is installed.
- Given a Linux machine where bubblewrap is installed but fails to create a user namespace, and the AppArmor setting is missing or off,
  when it is checked,
  then the reason is `other`, and the sentence carries bubblewrap's own first line.
- Given a Linux machine where bubblewrap starts but srt can't set up its network bridge,
  when it is checked,
  then the reason is `other`, and the sentence carries srt's own line, not "ready".
- Given WSL 1,
  when it is checked,
  then the reason is `not-supported`, and the sentence says to switch the distro to WSL 2.
- Given a macOS machine with Seatbelt but without ripgrep,
  when it is checked,
  then the reason is `ripgrep-missing`, not ok, because srt starts ripgrep next to Seatbelt too.
- Given Windows without srt's one-time setup,
  when it is checked,
  then the reason is `setup-needed`, not `windows`, because srt has a Windows mode.
- Given Windows without srt's one-time setup,
  when a session is opened,
  then opening fails and nothing runs.
