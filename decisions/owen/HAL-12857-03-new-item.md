# Decision: a new item's What changed page shows its fields, the file under Advanced

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12857 (a detail of the approved What changed screen, so a team decision under HAL-2282; found in the re-walk HAL-12840, C86)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:icuAfHHC6LvlNkPq5xM/HbZEfhCtrLkZsb2C1v/6x5luwHZimo9q48nvck3wxKVlZREHScLN85Tq39XmJQPxDg==

A new item whose file reads as its kind shows "New <kind>" ("New skill") and each field it sets,
labelled as an edited item's changes are ("Name", "When to use it", "Instructions"), with its whole
file under Advanced, closed at first, in place of the file's first lines and a loose "New". Other new
files keep their first lines and their one line. `source-control.whats-changed-page` says so; no test
was weakened.

## Covers

- source-control.whats-changed-page
