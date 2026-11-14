# Decision: the setup record holds the connector it belongs to

- Approval: HAL-9378 (Liam, CTO), decision comment of 14 Nov: option 1, with the link scoped to the workspace
- Kind: internal
- Task: HAL-9378

A Google setup record now holds `connector: { workspace, id }`, and `setups.start` requires it. The
two requirements that list the record's values name it.

## Covers

- google-setup.setup-record
- google-setup.setup-record-holds-no-secret

## What changes

- `google-setup.setup-record-holds-no-secret` lists the connector link among the values a record may
  hold. Its test that checks the exact key list gains `connector`.
- `google-setup.setup-record` says a new record holds the link. Its start test expects it.
- The new requirement `google-setup.connector-link` covers the link itself and the lookup by connector.
- No test is weakened: every old expectation stays, and the two above only gain the new key.

## Why

Nothing maps a connector to its Google setup: a connector file holds only the address, and the
account ref exists on one machine only, so the connector file can't point at the record. The record
points at the connector instead. The workspace is part of the link because two workspaces in one
profile can each have a connector with the same id. Studio's accounts list and the run's token
lookup both read the link.

## Known gaps

- The field is required. Nothing outside tests calls `setups.start` yet, so no stored record can lack
  it. A record without it reads as damaged.
