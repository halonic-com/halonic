# Decision: a failed proposal decision says why by its kind, and Compare's refusals get their own kinds

- Requirement: `inbox.proposal-page`, `studio.workspace-proposal-decisions`, `agent-host.proposal-compare-routes`
- Task: HAL-16083, from Sofia's words check C665 rows 27 and 40 on HAL-16066
- Approval: Liam approved rows 27 and 40 as planned on HAL-16083; he approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DX9J60Www3lhK1M893qQO7eeJ/Y8OGxy13/aEmEOofJnSZVEVHIfqob7E9bHt9ELmR60Rh8xc95pnWCDNr/qCQ==

## What changes

An Accept, a Reject or an Undo that fails no longer shows the host's own words. Studio sorts the
failure by the error's type and the host's kind, and the Inbox words it from that:

- the engine isn't answering: "The engine isn't answering. It may still be starting." with
  **Try again**;
- the workspace isn't trusted yet: "This workspace isn't trusted yet, so Studio can't change its
  files." with **Review**, which opens the same trust check as an approval's card, and the line
  goes once the workspace is trusted. Studio trusts nothing itself: it only stops asking the host;
- anything else: "Halonic ran into a problem it can't explain yet." with **Copy details**, the only
  place the host's words reach the person. There is no **Try again** for it.

The Undo toast "Couldn't undo this." gives the same reasons, with **Copy details** for a problem
Halonic can't explain.

In core, Compare's `choose` on a file already accepted or rejected throws
`ProposalAlreadyDecidedError` (`conflict`), and `compare`, `choose` and `parts` on a file the run
doesn't propose throw `ProposalFileUnknownError` (`not_found`). The agent host answers them as 409
`already_decided` and 404 `unknown_file` instead of 422 `proposal_refused`.

## Why

The host's text is written for the log, not for the person, and C665 row 27 asks for one plain
reason per kind. A failure no retry can help, such as an untrusted workspace or one Halonic can't
explain, shouldn't offer **Try again**. Row 40: Studio's Compare slice needs to tell "already
decided" apart from other refusals without reading the message.

## Tests

The Inbox test "says a failed accept with its reason and Try again" now expects the unexplained
reason with **Copy details**, and that the host's text isn't shown; it makes the same number of
`expect` calls. The not-answering test's failing Accept now fails as `not-answering`, the way Studio
sorts it. Core's two Compare refusal tests check the error's kind and path instead of its message.
New tests cover each kind on the proposal page and in the Undo toast, the sorting in Studio, and the
host's 409 `already_decided` and 404 `unknown_file`.

## Covers

- inbox.proposal-page
- studio.workspace-proposal-decisions
- agent-host.proposal-compare-routes
