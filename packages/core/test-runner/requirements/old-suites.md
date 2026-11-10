# test-runner.old-suites

- Status: active
- Since: 0.1.0
- Source: the tests of the old test runner (`packages/testing/test-runner/src/*.test.ts`) at 784f78d, item 6 of the HAL-187 work plan, and HAL-4448

When it runs the workspace tests of the old test runner's suites (acme, foreach, gets, hubs, knowledge, legacy, parallel, subflows and timers), the test runner shall pass each case the old runner passed, and shall fail each case the old runner failed, with failures as data that name the expected and actual step, steps, status or value, and the case's file and line. Where the new engine or loader does something else, the README lists it under "Differences from the old runner", with its requirement.

The old suites also tested the engine, the loader and the workflow rules directly, without a test file. Those checks belong to their own packages, and these tests leave them out.

## Examples

- Given the timers workspace, whose case advances one day twice and then approves, when its tests run, then the case passes, and the reminder timer fired two days after the start.
- Given a for-each step over three files, when its case runs, then the reader got one prompt per file, in order, and `notes` holds the three answers.
- Given a parent workflow whose child waits, when the case sends `approve`, then the child gets it and the parent's case passes with the child's output.
- Given `examples/acme` with a case that expects `states: [read, classify, draft]` of a run through `read, classify, ignored`, when it runs, then only `states` fails, with both lists and the case's line.
