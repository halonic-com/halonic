# sandbox-srt.check

- Status: active
- Since: 0.1.0
- Source: HAL-193 (plan phase 3, v1.17), HAL-1706

The sandbox-srt adapter shall say whether it can start on this machine, and when it can't, give the first listed reason (plain Windows, inside a container, user namespaces restricted, bubblewrap missing, `socat` or ripgrep missing) and one sentence saying what is missing, and never open a session in that case.

## Examples

- Given a Linux machine inside Docker with bubblewrap missing,
  when it is checked,
  then the reason is `container`, because it comes first.
- Given a Linux machine where bubblewrap is installed and user namespaces are allowed,
  when it is checked,
  then it can start, with no reason and nothing missing.
- Given a Linux machine where bubblewrap is installed but `socat` or ripgrep is not,
  when it is checked,
  then the reason is `linux-tools-missing`, because srt starts both next to bubblewrap.
- Given plain Windows,
  when a session is opened,
  then opening fails and nothing runs.
