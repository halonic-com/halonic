# Decision: a connector's `tools.approve` can say `all`

- Requirement: `format.connector-approve-all` (`packages/core/format/requirements/connector-approve-all.md`)
- Task: HAL-1219 (launch claim C89)
- Approval: [HAL-1257](/HAL/issues/HAL-1257#comment-b7f3187e-6b32-40db-a671-0d06c3ac492d), the format owner's answer that HAL-1219 adds `approve: all` with a new spec file and requirement; Liam reviews
- Kind: user-visible

## What changes

`tools.approve` in a connector file takes a list of tool names, as before, or the word `all`.
With `all`, every tool the connector offers asks a person first, including tools the server
adds after the file was written. A file that leaves `approve` out still means `[]`.

- `spec/connector.schema.json`: `tools.approve` becomes `anyOf` a list of strings or the
  constant `all`. No other property changes.
- `needsApproval(tools, name)` in `@halonicjs/format` answers the question for one tool. The
  outside-run gate uses it, so with `all` it refuses every tool from chat, as it refuses a
  listed one.
- The trust fingerprint keeps `all` as written, so switching between `all` and a list is a
  trust change, like any other change to `approve`.
- The `approved-tool-not-allowed` warning has nothing to compare with `all` and gives none.

## Why

A new MCP connector starts with every tool asking (C89). Halonic writes the file without
connecting to the server, so it can't name the server's tools; `all` says it without names and
keeps covering tools the server lists later. Google connectors keep their explicit lists
(HAL-1257, point 3).

One parity fixture changes its problem code: `approve: write_file` (a single word that isn't
`all`) used to fail with `invalid_type` and now fails with `invalid_union`, at the same line.
The file still fails. It is listed in `allowed-differences.json` as proposed, for Liam to sign
off in review.

## Tests

No test was weakened or removed. New tests cover reading `all`, the missing warning, a wrong
word, `needsApproval`, the gate and the trust fingerprint. The parity test counts ten allowed
files instead of nine, and the allowed-differences test lists the new entry.

## Covers

- format.connector-approve-all
- packages/core/format/spec/connector.schema.json
- packages/testing/parity/allowed-differences.json
