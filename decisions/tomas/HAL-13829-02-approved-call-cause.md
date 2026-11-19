# Decision: an approved call whose connector didn't start gets a cause, not a refusal

- Approval: Liam approves this note in his review of this pull request on HAL-13829
- Kind: internal
- Task: HAL-13829

## What changes

`engine.tool-result-cause` said calls inside a model's turn get no cause. One of them now does: a
call a person approved, whose connector couldn't list its tools when the agent went on after the
approval. Before, the turn found no tool of that name and logged `tool.refused` with
`not-offered`, as for a tool nobody ever offered, and the run went on as if nothing had
happened. Now the call gets a `tool.result` with `outcome: "error"` and a `connector-not-started`
cause, read from the listing error as for a recorded call (`program-missing` or `secret-not-set`
with the name, else `other`). There is no `tool.called`: the call reached nothing.

To know which connector the waiting call belonged to, the kernel now keeps the `connector` of
`approval.requested` on the waiting approval and hands it to the turn with the person's answer.
Older logs have no `connector` there, and their calls are refused as before.

A rejected call keeps its refusal: nothing had to start.

## Why

The C248 check (HAL-13818) found that, in a real run, an approved call whose program or secret was
removed while the run waited was logged as `not-offered`, and Studio said "Approved by you … The
run continues." The action the person approved never happened, and nothing said why. Studio's step
panel (PR 3 of HAL-12471) needs the cause to say which program or secret is missing.

## Tests

No test was weakened or removed. `local-runs-approved-not-started.test.ts` is new: a missing
program, a secret that isn't set, an error that doesn't say why, and a rejected call. The first
three fail on `main`.

## Covers

- engine.tool-result-cause
