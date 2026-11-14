# Decision: the run-routes 404 case for `GET .../events` moves to the event-stream tests

- Task: HAL-195
- Approval: Liam approves this note in review on the review task of PR 2625 (HAL-9128)
- Kind: internal

## What changes

`run-routes.test.ts` checked that `GET /api/runs/run_1/events` answers 404, because that address did
not exist. Part 10b adds it as the event stream, so that case would now be wrong and is removed from
the `server.run-routes` test. That is one `expect` fewer (96 to 95).

## Why

The address now exists and is covered by the new requirement `server.event-stream` in
`event-stream.test.ts`, which tests it far more closely (ids, `end`, resume, bad `after`, 404 for an
unknown run, abort). The other 404 cases in the `run-routes` test stay, including the unknown
action and the wrong method.

## Tests

No test is weakened or skipped. One case is removed because its premise is gone, and the route has new tests of its own.

## Covers

- server.run-routes
