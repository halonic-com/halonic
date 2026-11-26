# auto-approvals.ledger

- Status: active
- Since: unreleased
- Source: HAL-19416 (design rev 2, section 6 and 10), HAL-19462 (plan, PR 2), HAL-19486

When Studio evaluates a board approval in shadow mode, the auto approvals package shall write a ledger entry before it returns the evaluation's result, and shall not return the result when the write fails. Each entry shall hold its index, the hash of the entry before it, the time, the approval id, the SHA-256 of the payload and of the comments, the outcome, a reason code and, when there is one, the rule id and version, and the SHA-256 of all of these in canonical JSON. An entry shall never hold the payload, a comment or any other free text. `verifyChain` shall return `{ ok: true }` for a whole chain, and `{ ok: false, at }` naming the first entry that was edited, added, removed or moved.

## Examples

- Given five entries and the outcome of the third changed,
  then `verifyChain` returns `{ ok: false, at: 2 }`.
- Given a payload whose title is "Hire a designer",
  then no entry holds that title.
- Given a store whose write fails,
  then the evaluation is never returned.
