# workspace.test-references

- Status: active
- Since: 0.1.0
- Source: Nina's config-mistakes check on HAL-14257 (C337 rows 12–14, code row C18), HAL-14270

When `loadWorkspace` has parsed a workspace's files, the workspace package shall check each case of a workflow test against the workflow it targets, with the key path and line of what it is about:

- As the error `unknown-mock-agent`, each agent under `mocks` that the workflow's runs don't call: the agents of its steps and parallel branches, those of the workflows it runs, and their subagents. The key `*`, which scripts every other agent, is never reported.
- As the warning `mock-not-an-option`, each mocked reply of an agent whose output is a `choice` that isn't one of its options, with the whitespace around it trimmed, when every call of that agent is a step of its own with no method, no `format` and not as a subagent. A reply of `tool:` lines calls tools and isn't checked. It is a warning, because a test may expect the run to fail.
- As the error `unknown-expected-step`, `expect.final` and each step of `expect.states` that isn't one of the workflow's steps.

An error shall say "Did you mean <name>?" when exactly one name the workflow has is within an edit distance of 2 (`std.near-match`), and otherwise list the names it has. A test whose workflow isn't there gets only `workspace.references`' error. Mocks shall not be checked when a workflow or agent the runs reach didn't parse, or when the workflows they reach run each other in a loop, since those files' own errors are the cause.

## Examples

- Given a test that mocks `soter` for a workflow whose agents are `writer` and `sorter`, when it is loaded, then it gives the error "The test mocks the agent soter, which the workflow doesn't use. Did you mean sorter?".
- Given a test that mocks the reply `questions` for `sorter`, whose options are `refund`, `question` and `spam`, when it is loaded, then it gives the warning 'The mocked reply "questions" isn't one of sorter's options, so the run fails at that step. Use refund, question or spam.'.
- Given a test with `final: ignore` for a workflow with the step `ignored`, when it is loaded, then it gives the error 'expect.final is "ignore", but the workflow has no step ignore. Did you mean ignored?'.
- Given a test that mocks the subagent of an agent in a workflow the tested workflow runs, when it is loaded, then there is no issue.
