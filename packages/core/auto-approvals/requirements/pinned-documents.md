# auto-approvals.pinned-documents

- Status: active
- Since: unreleased
- Source: HAL-19416 (design rev 2, sections 4 and 8), HAL-19417 (threat model rev 2), HAL-19796

When Studio checks the pinned never-list issue, the auto approvals package shall decide nothing unless the stop document's newest revision was written by an owner and says exactly `stop: false`, so anyone, agents included, stops Studio by writing to it. The package shall also decide nothing unless the never-list is the pinned document of the pinned issue in Studio's company, it is locked, its newest revision is the document's latest and was written by an owner, and no revision number is used twice or dated before an earlier one.

## Examples

- Given an agent's revision `stop: false` on the stop document after an owner's,
  then the check gives `{ ok: false, reason: "stop.not_owner_latest" }`.
- Given an owner's revision `stop: true`,
  then the check gives `{ ok: false, reason: "stop.stopped" }`.
- Given a never-list that an owner unlocked,
  then the check gives `{ ok: false, reason: "never_list.unlocked" }`.
- Given a never-list whose newest revision was written by an agent,
  then the check gives `{ ok: false, reason: "never_list.not_owner_latest" }`.
- Given two owner revisions written in the same millisecond,
  then the one with the higher revision number is current.
