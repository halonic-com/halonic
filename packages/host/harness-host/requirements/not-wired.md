# harness-host.not-wired

- Status: active
- Since: 0.1.0
- Source: HAL-6277 (plan approved by Liam in HAL-6487); the real ones come with HAL-6477

Where a host can't yet ask a person or accept a proposal, `refusingApprovals` shall refuse every approval request with a `HarnessApprovalsNotWiredError` naming the tool, and `refusingTrash` shall refuse to move or restore any file with a `ProposalAcceptNotWiredError`, so neither can be taken for a real failure or swapped out unnoticed.

## Examples

- Given a harness agent that asks to run Bash,
  when the request reaches `refusingApprovals`,
  then it fails with `HarnessApprovalsNotWiredError` for "Bash".
- Given `refusingTrash`,
  when anything is moved to it or restored from it,
  then it fails with `ProposalAcceptNotWiredError`.
