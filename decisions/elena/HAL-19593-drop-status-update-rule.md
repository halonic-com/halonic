# Decision: the resource item no longer gives way to a Restart to update item

- Approval: Liam's review of #6506 (HAL-19579) asked for this follow-up
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KexBu+e4L23iSPMfoAxDmoQI1ZqhkVQygWHgR9p1I7cGIFRPUACB+yygrHLJeaS8Wa/Esccb0ik06ijZdowRBA==
- Task: HAL-19593

## What changes

`shell.resource-status-item` no longer says the item gives way, from 900 to 1199px, to an item
marked `data-status-update`, nor that the low-disk item stays when one is there. The item shows
from 900px wide, in its normal and its low-disk form. The code drops the matching class and the
test drops its assertion.

## Why

Since #6506 the status bar's update item no longer draws Restart to update, so nothing sets
`data-status-update` any more and the rule could never apply. Nothing a user sees changes.

## Covers

- shell.resource-status-item
