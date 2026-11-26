# Decision: reviewer line limits count each file, and take folder limits

- Approval: HAL-19256 (follows halonic's `overLineLimit` from HAL-18459)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xGNzgAgq1u82votUNwstGAmAo8Ah7EQGeCuuHQTxp3eGeHjuJTm5eMOOvmPdzflrXfCgF27OaULTSnrZ67ASDw==

The `reviewerRules` line limit of `github.pull-request` takes one more optional setting,
`folderLimits`: a list of `folders` with their own `max`, such as 800 changed lines in an engine's
kernel. It defaults to an empty list, so every existing tool file still parses unchanged. The JSON
spec files for tools and the workspace snapshot are regenerated to match; nothing is removed from
them.

The matcher now reads each file's additions and deletions from the files list it already fetched,
and counts only the files the limit doesn't skip, as halonic's `overLineLimit` does. Before, any
file outside `skip` made the whole pull request's lines count. Where a path's own count is
missing, the whole pull request's lines still stand in, which can only escalate more often.

`format.tool-reviewer-rules` and `runtime.github-reviewer-rules` say so, with new examples. No
existing test is weakened or removed.

## Why

halonic's reviewer rules gained a tighter limit for `packages/core/engine/src/kernel/` and
`packages/core/events/` (HAL-18459), counted per file. `reviewers.yaml` in the company workspace
could not say that, so its drift check against halonic's main fails until it can.

## Covers

- format.tool-reviewer-rules
- runtime.github-reviewer-rules
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
