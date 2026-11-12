# Decision: refuse Windows device names as folder ids without a lookahead

- Approval: [HAL-7196](/HAL/issues/HAL-7196)
- Kind: internal

Deployment ids (`deployments.yaml`) and agent ids (agent files) name folders
in the profile, so they refuse the names Windows keeps for devices (`con`,
`prn`, `aux`, `nul`, `com0`-`com9`, `lpt0`-`lpt9`). That rule was a
lookahead, `^(?!(?:con|…)$)`. Go's `regexp` and Rust's `regex` crate have no
lookaround, so a JSON Schema validator written in either language can't
compile `deployments.schema.json` or `agent.schema.json`. This is the same
problem #2139 fixed for `cloudflare.domain`; Liam approved the follow-up on
HAL-7196.

The device names move to a separate rule. In the JSON Schema it is
`not: { pattern: "^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$" }`, a plain
pattern every regex library reads, next to the id's own `pattern` (which
drops the `allOf` that held the two). In the parser it is a check with the
same problem code (`invalid_format`) and the same message as before.

What is accepted doesn't change: the same ids pass and fail, with the same
problems. The folder tests for both kinds now also check each candidate id
against the spec file's rule, and fail if one of its patterns uses
lookaround.

## Covers

- packages/core/format/spec/agent.schema.json
- packages/core/format/spec/deployments.schema.json
- packages/core/format/spec/runtime-export.schema.json
- packages/core/format/src/kinds/agent/harness-settings-folder.test.ts
- packages/core/format/src/kinds/deployments/runs-folder.test.ts
