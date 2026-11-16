# Decision: the connector status says how each connector connects

- Approval: Liam reviews this on HAL-10952; the change is built in HAL-1303 (P8c)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:En0FVhwuMlqKbJftJG5FEqim15F25Xh0bw/VDm5kDUc39+ixxufdGsRp7FTHmCAovhMENZg31LmDVuXxL0J1Bg==

## What changes

`studio.workspace-connector-status`: the status the desktop app gives the Library feature now also says how
each connector connects: its transport, its account, its URL or command, and the names of its secrets (never
a value). Before, it held only each connector's id and name, its state and the engine's recent refusals.
No example was removed or weakened, and the other rules are unchanged.

## Why

The connector page in the Library could not show how a connector connects, because the status did not carry
it. Reading it from the connector file is enough, and leaving out secret values keeps them out of the window.

## Covers

- studio.workspace-connector-status
