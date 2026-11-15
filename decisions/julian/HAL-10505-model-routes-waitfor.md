# Decision: the model-routes tests wait longer and settle their held chats

- Task: HAL-10505
- Approval: Liam approved the code of PR #2995 on HAL-10505
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:IVoyqA7ML/iOt8Ona2pAOVSODYO7+QB/BmoUxBuvGJjHy0JSwQKxm2VrufrVV2z/1fn3JMhj84TYTnx42PVCDA==

## What changes

The `vi.waitFor` calls in the tests of `agent-host.model-routes` get a 10 s timeout instead of the
1 s default, and the cap test frees and settles its held chats in a `finally`, so a failure stays
one assertion instead of two unhandled "fetch failed" errors. The code under test does not change.

## Why

On slow runners the default 1 s wait was too short and the cap test flaked. The requirement guard counts
`expect` calls, and a call inside `vi.waitFor` runs once per retry. The count therefore moves
between runs: 65 on this branch against 66 on the merge base.

## Tests

No assertion was added, removed or weakened. The assertions are unchanged. The count differs only
because of how often `vi.waitFor` retries (the HAL-6453 issue).

## Covers

- agent-host.model-routes
