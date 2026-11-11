# test-runner.run-tests

- Status: active
- Since: 0.1.0
- Source: item 6 of the HAL-187 work plan, the HAL-4224 plan review, and `runWorkflowTests` in the old test runner (`packages/testing/test-runner/src/index.ts`) at 784f78d

When asked to run a workspace's tests, the test runner shall run each case the filter keeps, one after the other, in file order and then case order, each on an engine of its own: fresh stores, a scripted model made from the case's `mocks` that every agent of the case's runs talks to, connectors that answer from the case's `tools`, the knowledge sources its agents list, built through the knowledge factories the caller gives (none when it gives none), and programs that answer from the case's `programs` (requirement `test-runner.scripted-programs`). The case's run shall be a `test` run with the id `test_1`. Its test clock shall start at the given clock's time and move only on an `{ advance }` event, which stops at each timer due on the way, so each timer fires at its own time and a timer it sets counts from then; after its start and after each event, the runner shall deliver the timers due until none is. A named event, with or without a payload, shall go to the case's run only while it waits; when the run isn't waiting or doesn't take the event, the case shall fail with `event-not-delivered`, naming the event and the run's status, and no later event shall be sent.

Each result shall hold the case's hub, workflow, name, file and line, whether it passed, how long it took on the given clock, its failures as data, the id of its run, and its run followed by every child run, each after the run that started it, with their summaries and events. The case shall fail with `unused-replies` for each agent with scripted replies its runs never asked for. An engine error, also one while closing the engine or reading the runs back, shall fail the case with `error` and its message, never stop the other cases.

The old runner had a fresh engine per case, the same events and the same implicit checks. The failure data, the run list and the per-case clock and ids are new: the CLI writes the sentences (HAL-1981, section 3.3), and the parity checks compare the runs with `run-logs.json` (HAL-1541).

## Examples

- Given an approval test with "approve", "the timer fires after two days" (two `advance: 1d`) and "one day is not enough", when the tests run, then all three pass, each with run `test_1` starting at the given time.
- Given a wait of one day that leads to another wait of one day, when a case advances two days at once, then the run ends, and its timers fired one and two days after the start.
- Given a case whose events are `[reject, approve]` for a wait that takes only `approve`, when it runs, then it fails with `event-not-delivered` for `reject` while `waiting`, and `approve` isn't sent.
- Given a workflow whose step starts a child workflow that waits, when the case sends `approve`, then the child receives it, and the result lists the child run after the case's own.
- Given an agent that lists a `handbook` knowledge source, when the caller gives a factory for its provider type, then the case's agent is offered `knowledge_search` and `knowledge_read` over it, and a `mode: auto` handbook's passages are in its prompt before the first model call; when the caller gives none, the agent gets neither.
- Given a run store that fails every write, when a case runs, then it fails with `error` and the store's message, and has no runs.
