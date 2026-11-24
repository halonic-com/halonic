# toolscript.artifact

- Status: active
- Since: unreleased
- Source: Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 1.4; task HAL-17567

When a ToolScript artifact is checked, the toolscript package shall take it only when it holds exactly a checked header, the compiled code, the `sourceHash` and `codeHash` as SHA-256 digests, and the profile version.

## Examples

- Given an artifact whose `codeHash` isn't a SHA-256 digest,
  when it is checked,
  then it is refused.
- Given an artifact with a key `signature`,
  when it is checked,
  then it is refused.
