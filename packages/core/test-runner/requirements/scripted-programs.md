# test-runner.scripted-programs

- Status: active
- Since: 0.1.0
- Source: the [HAL-4248 proposal](/HAL/issues/HAL-4248#document-proposal), approved by Liam on HAL-4258 and HAL-4313; task HAL-4248

While a case runs, the test runner shall carry out every step whose agent runs in a program harness (`claude-code` or `codex`) with a scripted program that never starts a real program, opens a real sandbox or serves a real bridge. Each program start of an agent shall get the next of the case's `programs` results for that agent id, whatever its prompt, in the order the engine starts that agent's programs. A string result or `{ output }` shall finish the program with that output, as a model reply would; `{ fails }` shall fail the program, so its run fails with that message.

When a program starts with no result left for its agent, the run shall fail at that step and the case shall fail with `unscripted-program`, naming the step and the agent. When results are left over after the case, the case shall fail with `unused-program-results`, with the agent and how many are left.

## Examples

- Given `programs: { coder: ["Fixed it."] }` and a task whose agent `coder` runs in `codex` with `output: fix`, then the run finishes with `fix` set to `Fixed it.`.
- Given `programs: { coder: [{ output: { files: 3 } }] }`, then the step's output is `{ files: 3 }`.
- Given `programs: { coder: [{ fails: "exited with code 1" }] }` and `expect: { status: failed }`, then the run fails with `exited with code 1` and the case passes.
- Given a `foreach` over two items whose agent runs in a program, then the first result goes to the first item and the second to the second.
- Given no result for `coder` and a step that starts its program, then the case fails with `unscripted-program` for that step and `coder`.
- Given two results for `coder` and a run that never starts its program, then the case fails with `unused-program-results`, 2 left.
