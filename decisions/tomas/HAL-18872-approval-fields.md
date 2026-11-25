# Decision: approvals say what they are and show their fields; tool confirmations are risky

- Task: HAL-18872
- Approval: Liam reviews this change on HAL-18872, part of the board's ask on HAL-18861 (every Paperclip approval works in Inbox and Messenger).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:G6B4Ufd/kDl/ZEyUDNEJoY8xFLuNJSkkpk9H3PruyHlvHAE8lec9T/IRijZTrNcQCFqJBzbx7as7MbVq0r9ECg==

## What changes

A Paperclip approval in the Inbox and Messenger now starts with its type in words ("Hire an
agent", "Strategy approval", "Budget override", "Board approval") instead of
"Approval: hire_agent", and shows its fields: the hire's name, role, adapter and monthly budget;
the strategy's plan; the budget's scope, limit and spend, with a line saying that approving
only records the answer; the board approval's recommended action and risks. Every approval
also offers **Request changes**, and one sent back that way stays listed as answered.

A confirmation that asks to run a tool (`payload.toolAction`) is now `risky`, so a phone can't
answer it unless the desktop allows it. The requirement `paperclip-client.approval-risk` said
every card is `normal`; it now names this one exception and gains an example for it.

Two expectations in `packages/adapters/paperclip-client/src/client-reads.test.ts` change from
"Approval: hire_agent…" to "Hire an agent…": the same checks on the new title. The fixed request
list test (`client-search.test.ts`) gains the `requestApprovalRevision` row. No test was
weakened, skipped or removed.

## Why

The gap table on HAL-18861 found approvals showing only their raw type, with the hire's details,
the plan and the budget amounts missing, so the board couldn't decide from Halonic. A tool
approval lets an agent write through a connection, which is as risky as a hire.

## Covers

- paperclip-client.approval-risk
- paperclip-client.approval-fields
- packages/adapters/paperclip-client/src/client-reads.test.ts
- packages/adapters/paperclip-client/src/client-search.test.ts
