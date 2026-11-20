# Decision: a failed step's known reason, in `run` and in `test`

- Approval: Liam asked for this on HAL-14270 (/HAL/issues/HAL-14270), from Nina's check C337 on HAL-14257 (row 13, code row C17); a team decision that builds on the approved C336 wording; Owen wrote it, so Liam signs
- Kind: user-visible

## What changes

- `halonic run` and `runs show`: no change here any more. #4086 (HAL-13862, decided by Liam) already made a known cause line 1's reason on `main` ("Support reply failed in the step Classify it. The agent sorter answered …"), so after the rebase this PR keeps `cli.run-failure` and its tests as they are on `main`.
- The engine's message for an answer outside the options now reads `The agent sorter answered "questions", which isn't one of its options (refund, question, spam). Tighten the agent's instructions or use a larger model.`, Nina's wording, instead of `Agent "sorter" answered "questions", which isn't one of its options: "refund", "question", "spam". …`. `engine.task-choice-answer` doesn't fix the words, so it doesn't change; the engine and test-runner tests that quote them now quote the new words.
- `halonic test`: a `status` failure of a run that failed now carries the run's error (`test-runner.expectations`), and the sentence under the failed test ends with it, after a full stop as the run's own line has it: `Expected the run to finish, but it failed in the step Classify it. The agent sorter answered "questions", …`. Before, it named only the step, and the cause was in `--json` run logs only. `cli.commands.test.run-tests` gets the rule and an example.

## Why

In Nina's check, a mocked reply outside the options made `test` say only "failed in the step Classify it", with no reason, and `run` said it "can't tell the cause yet" and then told it. The `run` half is fixed on `main` by #4086; this note covers the `test` half and the engine's words.

## Tests

No test was skipped or weakened. Tests that quote the old words or the old `status` failure now expect the new ones, with the same checks: the `answer-not-an-option` tests of the task, parallel and for-each states, the `status` failures in the test-runner's expectations, parallel, subflow and program tests. New: the reason in `test-report.test.ts`, and row 13 on a copy of Acme in `apps/cli/src/commands/test/command.test.ts`.

## Covers

- test-runner.expectations
- cli.commands.test.run-tests
- packages/core/engine/src/states/task/state.test.ts
- packages/core/engine/src/states/parallel/state.test.ts
- packages/core/engine/src/states/foreach/state.test.ts
- packages/core/test-runner/src/run/expectations.test.ts
- packages/core/test-runner/src/ported/parallel.test.ts
- packages/core/test-runner/src/ported/subflows.test.ts
- packages/core/test-runner/src/run-tests-programs.test.ts
