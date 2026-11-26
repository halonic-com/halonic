# @halonicjs/auto-approvals

Auto approvals in **shadow mode** (HAL-19462): the typed approval card, the workspace
never-list and the eligibility checks. Pure functions, no I/O, and nothing here approves or
denies: Studio only records what a rule would have done.

- **Card:** `toCard` builds an `ApprovalCard` from what was read for one approval. Only facts
  (written by the Paperclip server or Git) may allow; claims (payload, type, comments, issue
  text, `requestedByAgentId`) may only block. The requester comes from the `approval.created`
  activity entry. v1 has no live kinds, so every card is `untyped`.
- **Never-list:** `readNeverList` reads one revision of the pinned YAML document. Unknown
  fields, kinds and values fail closed. `effectiveNeverList` adds the built-in seed floor and
  applies the 24-hour loosen rule over the document's revisions.
- **Eligibility:** `checkEligibility` gives the first reason a card gets no decision.
  `tool_gateway` approvals and approvals touched after creation are never eligible. Keywords
  scan every claim after `normaliseClaim` (hidden characters removed, NFKC, lower case).

Design: HAL-19416 (`design`, rev 2). Threat model: HAL-19417.
