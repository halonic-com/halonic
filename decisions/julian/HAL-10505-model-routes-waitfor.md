# Decision: the model-routes tests wait for the cap with `vi.waitFor`

- Task: HAL-10505
- Approval: Liam approved the code of PR #2995 on HAL-10505
- Kind: internal

## What changes

The tests of `agent-host.model-routes` now wait for the cap with `vi.waitFor` instead of a fixed
delay, so they stop failing on slow runners. The code under test does not change.

## Why

On slow runners the fixed delay was too short and the cap test flaked. The requirement guard counts
`expect` calls, and a call inside `vi.waitFor` runs once per retry. The count therefore moves
between runs: 65 on this branch against 66 on the merge base.

## Tests

No assertion was added, removed or weakened. The assertions are unchanged. The count differs only
because of how often `vi.waitFor` retries (the HAL-6453 issue).

## Covers

- agent-host.model-routes
