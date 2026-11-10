# test-runner.scripted-tools

- Status: active
- Since: 0.1.0
- Source: scripted tools in the old test runner (`packages/testing/test-runner`) at 784f78d, HAL-3331 (`checkToolCall`) and the HAL-4224 plan review

While a case runs, the test runner shall give every connector of the workspace a scripted client that never reaches a real server. Each call to a connector's tool shall get the next of the case's results for `<connector>.<tool>`, whatever its arguments. A tool the connector's `tools.approve` names shall be listed as one that changes things, so the run asks a person first, as it would for real; every other tool shall be listed as one that reads. Sending shall always be allowed, because nothing real is reached.

When a run calls a tool with no result left, the call shall fail inside the run and the case shall fail with `unscripted-tool`, naming the tool. When results are left over after the case, the case shall fail with `unused-tool-results`, with the tool and how many are left.

## Examples

- Given `tools: { crm.lookup: ['{"vendor": "Acme Paper"}'] }` and an agent that calls `lookup`, then the model gets that result and the case can pass.
- Given no result for `crm.lookup` and an agent that calls it, then the case fails with `unscripted-tool` for `crm.lookup`.
- Given two results for `crm.lookup` and a run that never calls it, then the case fails with `unused-tool-results`, 2 left.
- Given `crm.update` in the connector's `tools.approve`, when the agent calls it, then the run waits for a person's OK.
