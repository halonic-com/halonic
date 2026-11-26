# auto-approvals.never-list

- Status: active
- Since: unreleased
- Source: HAL-19479, PR 1 of HAL-19462 (design rev 2 on HAL-19416, section 4, S2)

The auto approvals package shall read the never-list document and fail closed with a reason on text that isn't YAML, an unknown field, kind or value, a missing field, another version or another workspace. The board's seed entries shall apply even when the document leaves them out. Keywords shall match every claim after Unicode NFKC, lower case and removing hidden characters. A hold shall block every approval type it covers. An added entry or hold shall apply at once; a removed one shall keep applying until 24 hours after the revision that removed it.

## Examples

- Given an entry `approval_type: hire_agnet`, when the document is read, then it gives `{ ok: false, reason: "never_list.unknown_value" }`.
- Given a document without `hire_agent`, when a `hire_agent` card is screened, then it is blocked.
- Given an entry removed at 10:00, when the list is read the next day at 09:59, then it still applies; at 10:00 it doesn't.
- Given the keyword `secret`, when a payload says `ｓｅｃｒｅｔ`, then it is blocked.
