# @halonicjs/auto-approvals

Shadow-mode auto approvals for Paperclip board approvals (HAL-19462, design on HAL-19416).
Studio reads approvals and records what a rule would have done. **Nothing in this package can
approve or deny:** it has no I/O at all, and v1 has no live approval kind.

- **Card:** `toCard` builds an `ApprovalCard` from what was read. Facts (written by the
  Paperclip server) may allow; claims (anything an agent can write) may only block. The
  requester comes from the `approval.created` activity entry; a mismatch with
  `requestedByAgentId` makes the card `untyped`.
- **Never-list:** `readNeverList` reads the pinned never-list document. Unknown kinds and
  values fail closed, and the board's seed entries are always on, even when removed.
- **Loosen slowly:** `effectiveNeverList` keeps a removed entry or hold for 24 hours after
  the revision that removed it; an addition applies at once.
- **Screen:** `screenCard` gives `eligible: false` with every reason that blocks a card.
