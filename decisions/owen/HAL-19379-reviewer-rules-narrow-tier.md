# Decision: reviewer rules take a narrower role below `default`

- Approval: HAL-19379 (follows halonic's `routine-reviewer` from HAL-19246)
- Kind: internal

The `reviewerRules` of `github.pull-request` take one more optional setting, `narrowTo`: a
`role`, `folders` and `patterns` regexes. A pull request that no rule escalates goes to
`narrowTo.role` unless one of its paths is under `folders` or matches `patterns`; then it stays
with `default`. The rules may now name `routine-reviewer`, the role the snapshot's routing
already accepts. Without `narrowTo` nothing changes, so every existing tool file parses and
routes as before. The JSON spec files for tools and the workspace snapshot are regenerated to
match; nothing is removed from them.

The note "unless it's a security or release pull request" now goes on an approval by whoever
covers the role the paths pick when that role is below `escalateTo`, so on the narrower role's
too: it can't see what the author declares either.

`format.tool-reviewer-rules`, `runtime.github-reviewer-rules` and
`runtime.github-reviewer-approval-note` say so, with new examples. No existing test is weakened
or removed.

## Why

halonic's reviewer rules gained a third role, `routine-reviewer` (HAL-19246): the second
reviewer's scope minus `packages/core/`, `packages/host/`, `packages/testing/spec/` and a
package's public interface (`src/index.ts`). All of that is expressible as folders and one
regex. `reviewers.yaml` in the company workspace could not say it, so its drift check against
halonic's main fails until it can.

## Covers

- format.tool-reviewer-rules
- runtime.github-reviewer-rules
- runtime.github-reviewer-approval-note
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
