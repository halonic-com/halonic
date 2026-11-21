# cli.commands.tools.integration-connector

- Status: active
- Since: unreleased
- Source: HAL-14784 (found while testing HAL-3103)

When `halonic tools review <source>` or `halonic tools approve <source>` names an integration's connector, the command shall start nothing, say that its tools need no approval because they come from the integration's permission sheet, show no report link and exit 0. With `--json` it shall give `needsNoApproval: "integration"` with `ok: true`, not an error.

## Examples

- Given Acme's connector `issues` with `transport: { integration: { folder: issues } }`,
  when `halonic tools review issues` runs,
  then it prints "issues is an integration's connector. Its tools need no approval: they come from the integration's permission sheet." and exits 0.
- Given the same,
  when `halonic tools approve issues --all --json` runs,
  then the document has `ok: true`, no tools approved and `needsNoApproval: "integration"`.
