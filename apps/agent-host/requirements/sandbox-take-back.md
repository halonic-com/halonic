# agent-host.sandbox-take-back

- Status: active
- Since: unreleased
- Source: HAL-16084; HAL-16082 (findings: the installer's sandbox step recreates srt's account before any take-back)

When the agent host is started with `--sandbox-take-back`, the agent host shall take back the grants a removal with administrator rights left (`sandbox-srt.take-back`), print one JSON line with `ok` and the `outcome` (`taken_back`, `none`, `elevated` or `failed`), and exit with 0 when `ok` is true and 1 when it isn't, without serving. Like every host command, the executable needs `--profile-folder`, which the installer passes.

## Examples

- Given srt lists kept grants while its sandbox account is gone, and a process without administrator rights,
  when the host runs `--sandbox-take-back`,
  then it prints `{"ok":true,"outcome":"taken_back"}` and exits with 0.
- Given nothing to take back,
  when the host runs `--sandbox-take-back`,
  then it prints `{"ok":true,"outcome":"none"}` and exits with 0.
- Given the host runs with administrator rights, or srt can't forget the grants,
  when it runs `--sandbox-take-back`,
  then it prints `ok` false with `elevated` or `failed` and exits with 1.
