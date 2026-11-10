# format.workflow-test-programs

- Status: active
- Since: 0.1.0
- Source: the [HAL-4248 proposal](/HAL/issues/HAL-4248#document-proposal), approved by Liam on HAL-4258; task HAL-4248

When `parseFile` reads a workflow test file, the format shall accept an optional `programs` key on each case, and leave it out when the case does, so older files read as before. `programs` maps an agent id to a list of scripted program results. A result is a string (the program's text output), `{ output: <any value> }` (the program's output; the `output` key must be there, even if its value is `null`) or `{ fails: <message> }` (the program fails with a non-empty message). Any other result, or a result with another key, fails.

The test runner uses an agent's results in the order the engine starts that agent's programs, one result per start. In a `foreach` state that is the order of the items. A `parallel` branch can't start a program yet (the engine fails the run); once it can, the engine starts branches in the order of their names, so that is the order of the results.

## Examples

- Given a case without `programs`, when it is parsed, then it has no `programs` key.
- Given `coder: ["Fixed it.", { output: { files: 3 } }, { fails: "exited with code 1" }]`, when it is parsed, then the three results are kept in that order.
- Given the result `{}`, when it is parsed, then it fails with `invalid_union`.
- Given `{ fails: "" }`, when it is parsed, then it fails with `too_small` at `fails`.
- Given `{ output: x, exitCode: 1 }`, when it is parsed, then it fails with `unrecognized_keys`.
