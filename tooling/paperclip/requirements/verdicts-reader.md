# paperclip.verdicts-reader

- Status: active
- Since: unreleased
- Source: HAL-19481, 2.2 of the plan on HAL-19228 with Liam's changes from HAL-19325

When a gate asks what the recorded verdicts say about a pull request's current head (`verdictsFor`), the plugin shall read only the records `review_verdict` stored for that pull request, leave out any entity changed after it was stored, and answer:
- an approval counts when it names the current head by its full SHA, or when the fingerprint recorded with it matches the current head's fingerprint, and then only as `judgeApprovals` judges it on the current head (no own pull request, each reviewer within their limits);
- a head without a fingerprint needs an approval of that exact head;
- a reviewer's change request holds the pull request at every head until the same reviewer records an approval or `withdrawn`;
- Julian's `security-ok` counts only on the exact head it names;
- approved means an approval counts and no change request holds it.

When the records can't be read, it shall answer `unknown` with the reason, never approved. Until the gates move to it in shadow mode (2.4 of the plan), no gate reads it.

## Examples

- Given Julian's approval recorded on head A within his limits,
  when the head is still A,
  then it counts.
- Given that approval and a rebase to head B with the same fingerprint,
  when the gate asks,
  then it counts on B, carried from A; with another fingerprint, or none, it doesn't.
- Given Liam's change request on A and Julian's later approval on B,
  when the gate asks,
  then the pull request is held by Liam, until Liam approves or withdraws.
