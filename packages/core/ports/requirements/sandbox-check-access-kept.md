# ports.sandbox-check-access-kept

- Status: draft
- Since: unreleased
- Source: HAL-15851 (option 2 of HAL-15850); HAL-15836 (`keptAccess: "manual"`); docs/adr/2026-11-22-sandbox-check-access-kept.md

When the sandbox can't start because its one-time setup isn't done (`setup-needed`), the `Sandbox` port shall let the adapter say that the backend still keeps access to the user's folders that a removal with administrator rights left (`accessKept`), so Studio can offer to remove the sandbox again without them. The flag is optional, only goes with `setup-needed`, and is never set when the sandbox can start.

## Examples

- Given srt on Windows that lists kept grants while its sandbox account is still there,
  when the adapter reports `setup-needed`,
  then `accessKept` is `true`.
- Given a refusal from an adapter that can't tell,
  when it is compiled,
  then it compiles without `accessKept`.
- Given a check that works, or `accessKept` set to anything but `true`,
  when it is compiled,
  then it doesn't compile.
