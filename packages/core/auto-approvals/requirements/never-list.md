# auto-approvals.never-list

- Status: active
- Since: unreleased
- Source: HAL-19416 (design rev 2, section 4), HAL-19479

When Studio reads the workspace never-list, the auto approvals package shall fail closed on an unknown field, entry kind or value, on a wrong workspace, an unsupported version or text that doesn't parse. The package shall always apply the board's seed entries, whatever the document says. The package shall apply an added entry or hold at once, and a removed one only 24 hours after the revision that removed it. The package shall match keywords after removing hidden characters, Unicode NFKC and lower case.

## Examples

- Given an entry `approval_type: hire_agnet`,
  then the read gives `{ ok: false, reason: "never_list.unknown_value" }`.
- Given a document without the `hire_agent` entry,
  then a `hire_agent` approval is still blocked.
- Given a revision that removes an entry at T,
  then the entry still blocks at T + 23:59 and no longer blocks at T + 24:00.
- Given the keyword `secret` and a claim "ＳＥＣＲＥＴ" or "secret" split by a zero-width space,
  then the claim is caught.
