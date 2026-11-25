# Decision: the format gets its first writing actions

- Approval: HAL-17956 (Liam, CTO: decisions A and B and the security requirements for PR 1)
- Kind: internal

`format.tool-actions` said that none of the actions writes. It now lists three writing
actions, `paperclip.comment`, `paperclip.next-step` and `paperclip.finish-run`, each with
one setting, `mode`, which is `dry-run` unless the tool file says `write`. The list test
names the nine actions and the three that write instead of checking that none does.
The JSON spec files for tools and the workspace snapshot are regenerated to match.

`runtime.tools`' action-list test said no action was available until it had a handler;
the three writing actions now have one, so it names them.

## Why

The phase 3 plan (HAL-17450) moves the task tools into the generic plugin runtime. The
writing tools can't be tool files until the format has generic writing actions, and Liam
approved adding them on HAL-17956, starting in dry run for one pass.

## Covers

- format.tool-actions
- runtime.tools
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
