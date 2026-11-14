# google-setup.connector-link

- Status: active
- Since: 0.1.0
- Source: HAL-9378 (design check A4); Liam's decision of 14 Nov: the record points at its connector

Every setup record shall hold the connector it belongs to as the workspace's key and the connector's id in it, and `start` shall require both. A workspace key shall be 32 lower-case hex characters and a connector id lower-case letters, digits, `-` and `_`, starting with a letter or digit, at most 64 characters; for any other link `start` shall throw `SetupRecordError` `refused` and write nothing. The records shall look a setup up by connector, matching both the workspace and the id, and give `null` when there is none. A record that has no valid link shall read as damaged. The link is neither a secret nor personal, and no edit changes it.

## Examples

- Given a setup started for workspace A's `gmail`,
  then the record holds that workspace key and `gmail`, and reads back the same after the store is opened again.
- Given a setup for workspace A's `gmail` and none for workspace B's `gmail`,
  when the setup of B's `gmail` is looked up,
  then the answer is `null`, never A's record.
- Given a connector id with a `/`, a `..` or an upper-case letter, or a workspace key that isn't 32 hex characters,
  when a setup is started,
  then it throws `refused` and no record is written.
- Given two records for the same connector,
  then the lookup gives the one started last.
- Given a stored record with no `connector`,
  then reading it throws `damaged` and listing leaves it out.
