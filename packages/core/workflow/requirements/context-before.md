# workflow.context-before

- Status: active
- Since: 0.1.0
- Source: `contextBefore` in the old workflow package (`packages/core/workflow/src/inputs.ts`) at 784f78d

When asked which context keys a state can read, the workflow rules shall give, sorted, the keys of the workflow's initial context and the keys written by every state with a path of transitions to that state: its `output`, its `conversation`, the name of each branch of a parallel state, and `lastEvent` for a wait state, as the engine writes them. A state on a loop counts as one of its own earlier states.

## Examples

- Given the mail workflow (`tag` writes `tags`, `check` writes `check`, initial context `owner`), when the keys before `tag` are asked for, then they are `owner`.
- Given the same workflow, when the keys before `reply` are asked for, then they are `check`, `owner` and `tags`.
- Given `draft` writes `draft` and a reject goes back to it from the wait state `review`, when the keys before `draft` are asked for, then they are `draft` and `lastEvent`.
- Given `chat` keeps its conversation in `turns` and the parallel state `both` has the branches `left` and `right` and writes `results`, when the keys after both are asked for, then they are `left`, `results`, `right` and `turns`.
