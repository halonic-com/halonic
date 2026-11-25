# Decision: the format gets the action halonic.precheck

- Approval: HAL-17969 (Liam, CTO: the plan for the `halonic.precheck` action and its seven security conditions)
- Kind: internal
- Signature:

The format's action list gains `halonic.precheck`, the runtime port of Agent tools'
`ready_for_review`. It writes nothing, needs no key, reads the optional parameters `branch`,
`sha` and `checkId`, and takes no settings (`{}`, strict): the precheck service's address is a
plugin setting, never a workspace one. The JSON spec files for tools and the workspace
snapshot are regenerated to match. The only change in them is one more choice for
`action`, `run: halonic.precheck` with empty settings. No existing choice changes.

## Why

The phase 3 plan (HAL-17450) moves the task tools into the generic plugin runtime.
`ready_for_review` can't be a tool file until the format names an action for it, and Liam
approved adding it on HAL-17969.

## Covers

- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
