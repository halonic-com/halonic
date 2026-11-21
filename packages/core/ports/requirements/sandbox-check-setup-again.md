# ports.sandbox-check-setup-again

- Status: active
- Since: unreleased
- Source: HAL-5404; design section 4 on HAL-3779 (the one admin prompt per setup version); plan approved by Liam on HAL-5404 (docs/adr/2026-11-21-sandbox-check-setup-again.md)

When the sandbox can't start because its one-time setup isn't done for this release (`setup-needed`), the `Sandbox` port shall let the adapter say that the setup was done on this machine for an older release of the backend (`setupAgain`), so Studio can tell "set up again" apart from "never set up". The flag is optional, only goes with `setup-needed`, and is never set when the sandbox can start.

## Examples

- Given srt on Windows whose setup marker is older than the setup version the bundled srt needs,
  when the adapter reports it,
  then `reason` is `setup-needed` and `setupAgain` is `true`.
- Given a refusal from an adapter that can't tell an older setup from none,
  when it is compiled,
  then it compiles without `setupAgain`.
- Given a check that works, or `setupAgain` set to anything but `true`,
  when it is compiled,
  then it doesn't compile.
