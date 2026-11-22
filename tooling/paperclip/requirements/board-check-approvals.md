# paperclip.board-check-approvals

- Status: active
- Since: unreleased
- Source: HAL-16194; the Board Checker addendum on HAL-15997, section 1 part (d), with Mateo's answer on HAL-16193 (22 Nov)

In each 10-minute board-check pass, the Agent tools plugin shall read the company's pending approvals directly and, through the write gate, comment once on the Board Checker's task with each approval that wasn't pending at the last pass, oldest first, as its id, kind, who asked and when, with no payload; it shall never decide an approval, and its first pass shall only note what is pending.

## Examples

- Given approval-1 pending at the last pass and approval-2 new, asked by Chief at 13:20,
  when the job runs,
  then it comments "New pending approvals: 1. Listed only; the board decides them." with "approval-2: hire_agent, asked by Chief at 2026-11-22T13:20:00.000Z".
- Given the same approvals,
  when the job runs again,
  then it doesn't comment.
- Given no pass has run yet and approval-1 pending,
  when the job runs,
  then it doesn't comment.
