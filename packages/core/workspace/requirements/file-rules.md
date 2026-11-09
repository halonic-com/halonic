# workspace.file-rules

- Status: active
- Since: 0.1.0
- Source: HAL-1523 (HAL-186 implementation plan, step 1b; HAL-871)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as an error, with the old loader's message: agents of one hub that delegate to each other in a loop, once per loop on its first agent; each file after the first, by path, with the id of another file of its kind in the same hub, naming the first; and a workspace whose source has no `workspace.yaml`.

## Examples

- Given the parity case `agent/delegation-loop`, when it is loaded, then `checker.agent.yaml` gives "Agents delegate in a loop: checker → reviewer → checker" at `subagents`, and `reviewer.agent.yaml` gives nothing.
- Given the parity case `provider/duplicate-id`, when it is loaded, then `providers/mock.yaml` gives 'Duplicate id "mock" (also in providers/mock-copy.yaml)' at `id`, line 1.
- Given the parity case `workspace/missing-file`, when it is loaded, then `workspace.yaml` gives "Missing workspace.yaml" at line 1.
- Given a `workspace.yaml` that isn't valid YAML, when it is loaded, then it gives only its syntax problem.
