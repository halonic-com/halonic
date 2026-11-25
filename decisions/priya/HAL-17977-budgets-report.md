# Decision: the format gets a read-only budgets action

- Approval: HAL-17977 (step 5 of the phase 3 plan on HAL-17450, rev 5: budgets first read-only)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SelXCIzFABZD8PE+pP36BxNsWQb+w0llZf88GNq25/xnEeav0sPJbp33ITb+pCLgA2DeUuQIiXWuww0Vs7PHCw==

`format.tool-actions` lists one more action, `paperclip.budgets`. It needs `paperclip-api` and
takes one setting, `agents`: each agent's monthly budget in dollars by its url key. It doesn't
write. The list tests in `format.tool-actions` and `format.tool-action-parameters` now name eleven
actions instead of ten. The JSON spec files for tools and the workspace snapshot are regenerated
to match.

`runtime.tools`' action-list test names the available actions; `paperclip.budgets` is added to
it. The new `runtime.paperclip-budgets` tests check the report against a known mismatch and that
the action asks for no capability beyond the runtime's own `agents.read`.

## Why

Step 5 of the plan has the workspace say what each agent's budget should be and the plugin
report where Paperclip differs. A budget is money, so writing one stays with the board; this
action only reads Paperclip's agent list.

## Covers

- format.tool-actions
- format.tool-action-parameters
- runtime.tools
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
