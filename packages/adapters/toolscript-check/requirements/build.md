# toolscript-check.build

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 1.4; task HAL-17568

When a ToolScript that passes the check is built, the checker shall return an artifact with the checked header, the code stripped of types as an ES2023 module (empty for a declarative script), the SHA-256 of the source and of the code, and the profile version, and the same source, with `\n` or `\r\n` line ends, shall always give the same artifact. When an artifact's code doesn't match its `codeHash`, verifying it shall fail.

## Examples

- Given the `acme` example script,
  when it is built twice, once from a copy with `\r\n` line ends,
  then both artifacts are identical.
- Given a built artifact whose code was changed afterwards,
  when it is verified,
  then verifying fails.
