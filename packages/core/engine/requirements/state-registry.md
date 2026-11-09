# engine.state-registry

- Status: active
- Since: 0.1.0
- Source: HAL-1526, step 3(a) of the HAL-186 plan; decision 2 on HAL-1515

The engine shall find its state handlers through the folders in `src/states`, listed by `pnpm discover`, and the list shall be typed against the state types the engine runs, so that a missing or extra state folder fails typecheck. When a run enters a state whose type has no handler yet, or a state the workflow doesn't have, the engine shall fail the run with an error that names it.

## Examples

- Given the `task` and `final` folders,
  when `pnpm discover` runs,
  then `src/generated/states.ts` lists `final` and `task`, and it typechecks against the registry type.
- Given a workflow whose first state is a `wait` state,
  when a run starts,
  then it fails with `The engine can't run "wait" states yet.`
