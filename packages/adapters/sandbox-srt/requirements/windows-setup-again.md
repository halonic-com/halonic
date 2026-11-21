# sandbox-srt.windows-setup-again

- Status: active
- Since: unreleased
- Source: HAL-5404; design section 4 on HAL-3779; `Sandbox` port v9 (docs/adr/2026-11-21-sandbox-check-setup-again.md)

When srt's Windows setup is on the machine but its setup version is older than the one the bundled srt needs, the srt sandbox's check shall say `setup-needed` with `setupAgain`, so Studio can say the sandbox needs setting up again. Without a setup, with a current one, or when srt can't say, the check shall leave `setupAgain` out.

## Examples

- Given srt's setup marker at version 2 and a bundled srt that needs 3,
  when the sandbox is checked,
  then the check is `setup-needed` with `setupAgain`.
- Given no setup on the machine,
  when the sandbox is checked,
  then the check is `setup-needed` without `setupAgain`.
- Given srt's status that can't be read,
  when the sandbox is checked,
  then the check is still `setup-needed`, without `setupAgain`.
