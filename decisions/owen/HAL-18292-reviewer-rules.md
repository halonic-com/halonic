# Decision: `github.pull-request` takes optional reviewer rules

- Approval: HAL-18292 (PR 1 of HAL-18289, as Liam set it out there)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:o0hJIdl9WxCAvYJNC+2qjq+AGQGSZ0W04GEDz1++6S9Rkevo0z6TYpvqLeOGs+GcQcpsLxzk3lj7lsV49XPfAQ==

The `github.pull-request` action takes one more optional setting, `reviewerRules`: for each
repository, the files, folders, words (with `wordsSkip` regexes), a line limit (with skip
regexes), whether a nested `package.json` escalates, and the `default` and `escalateTo` roles.
The setting is optional, so every existing tool still parses unchanged. The JSON spec files for
tools and the workspace snapshot are regenerated to match; nothing is removed from them.

The new `format.tool-reviewer-rules` and `runtime.github-reviewer-rules` requirements cover the
setting and the matcher. No existing test is weakened or removed.

## Why

Agents ask the plugin who reviews a pull request. Keeping the path rules in the workspace lets
the plugin answer by role (`second-reviewer` or `code-reviewer`), and the snapshot's routing names
the person. The answer always says it goes by paths only, because security and release PRs, and
the rules on who reviews whose PRs, route differently.

## Covers

- format.tool-reviewer-rules
- runtime.github-reviewer-rules
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
