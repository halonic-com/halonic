# paperclip-client.shadow-red-team

- Status: active
- Since: unreleased
- Source: HAL-19463 (red-team cases, part A), HAL-19507 (threat model checks G2 to G4), HAL-19462 (plan, PR 4), HAL-19901

When the auto approvals shadow runner reads through the Paperclip shadow reader, every red-team case of part A shall end in "no decision" with its own reason, through the real reader and runner against a fake Paperclip, and with no agent-written text or key in the ledger or the digest. The shadow reader shall give the server's time from the newest answer's `Date` header, fail closed with `read.incomplete` when the activity or the comments fill a whole page of 500, and give each failed read its own code: `read.status`, `read.rate_limited` for 429, `read.too_large`, `read.not_json`, `read.wrong_company`, `read.wrong_entity`, `read.bad_shape`, `read.redirect`, `read.offline`, `read.signed_out` or `read.refused`.

## Examples

- Given `requestedByAgentId` names agent B and the `approval.created` actor is agent A,
  then the ledger entry says `card.untyped:requester_mismatch` and the digest lists the approval.
- Given Paperclip answers the approvals list with 429,
  then the poll stops with `read.rate_limited`.
- Given a fault that tries a POST through the shadow guard,
  then Paperclip hears nothing and the runner halts with `guard.refused`.
