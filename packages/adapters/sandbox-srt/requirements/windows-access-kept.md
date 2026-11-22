# sandbox-srt.windows-access-kept

- Status: draft
- Since: unreleased
- Source: HAL-15851 (option 2 of HAL-15850); HAL-15836; `Sandbox` port v11 (docs/adr/2026-11-22-sandbox-check-access-kept.md)

When srt's Windows setup isn't done (`setup-needed`) and srt lists kept grants while its sandbox account is still there, as a removal with administrator rights leaves them (`keptAccess: "manual"`, `sandbox-srt.removal-kept-access`), the srt sandbox's check shall add `accessKept`, so Studio can offer to remove the sandbox again. When srt lists no kept grants, lists them without its sandbox account (the next start takes those back), or its status can't be read, the check shall leave `accessKept` out.

## Examples

- Given no srt setup on Windows, and srt lists kept grants with its sandbox account there,
  when the sandbox is checked,
  then the check is `setup-needed` with `accessKept`.
- Given the same, but srt's status can't be read,
  when the sandbox is checked,
  then the check is `setup-needed` without `accessKept`.
- Given no srt setup and no kept grants,
  when the sandbox is checked,
  then the check is `setup-needed` without `accessKept`.
