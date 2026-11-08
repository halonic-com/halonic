# workflow.approval-decision

- Status: active
- Since: 0.1.0
- Source: `APPROVAL_EVENTS` and `approvalDecision` in the old workflow package (`packages/core/workflow/src/approvals.ts`) at 784f78d

When an event arrives for a tool call that waits for approval, the workflow rules shall read `approve` as approving the call, `reject` as rejecting it, and any other event as no decision.

## Examples

- Given the approval events, when they are listed, then they are `approve` and `reject`, in that order.
- Given the event `approve`, when its decision is read, then the call is approved (`true`).
- Given the event `reject`, when its decision is read, then the call is rejected (`false`).
- Given the event `done`, or `Approve` in another case, when its decision is read, then there is no decision (`null`).
