# Decision: an item has the same icon, name and kind everywhere in Changes

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12857 (a detail of the approved Changes screen, so a team decision under HAL-2282; found in the re-walk HAL-12840, C86)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jaRPNxUr7Sm7BqugyNmEol/BWyEl64L1b2NYFmXNODBy4EONaiRReG/rxTKQ3RKSIXPGyuKDA+WtwaFJpJ+IAA==

Create version's rows show the item's icon and kind beside its name, as the Changes list does, so two
items of one name (a workflow and its routine) can be told apart, by eye and by a screen reader. A
workflow test is called by the workflow it tests instead of by its id. Hubs, providers, workflow
tests and the other kinds get the icon of the place or Settings section where they are, not the
Library's. `source-control.change-list` and `source-control.create-version` say so; nothing they
said before is dropped, and no test was weakened.

## Covers

- source-control.change-list
- source-control.create-version
