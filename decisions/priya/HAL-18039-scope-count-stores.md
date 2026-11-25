# Decision: request-count stores keep a count per scope

- Approval: Liam approved the plan on HAL-18039 (follow-up to the HAL-18037 security review, S-9)
- Kind: internal

The request-count store gains an optional scope, so the server can count each scope's share of
the daily ceiling in a later pull request. Nothing calls it with a scope yet.

- contracts.request-count-store gains one sentence: a call that names a scope is counted in that
  scope's own count, apart from the total and from every other scope, by the same rules. Two
  examples are added. Nothing it already said changes, apart from "the count" becoming "every count"
  in the durability sentence.
- server.request-count-store gains the same rule, says `MemoryRequestCountStore` drops scope counts
  at a new day, and adds `CoordinationRequestCountStore`, moved here from the two targets so the
  scope counting is written once. One example and one sentence of rationale are added.

## Covers

- contracts.request-count-store
- server.request-count-store
