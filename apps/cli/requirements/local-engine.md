# cli.local-engine

- Status: active
- Since: 0.1.0
- Source: HAL-3814 (plan for `halonic run`, PR D, approved by Liam on HAL-3895)

The CLI shall run a workspace's workflows in an engine in its own process, on the workspace's run store, blob store and records in the person's profile folder, never in the workspace, so `halonic runs` and the Studio see the runs it starts. A run's timers shall be kept in the workspace's records, so a run that waits on a timer goes on in the next engine opened on that workspace. A new run shall start with the workspace's definitions of its hub as they are now (`workspace.run-definitions`). Its model calls shall go to the workspace's models (`cli.workspace-models`). In 0.1 the engine shall offer no Halonic tools, no connectors and no harnesses.

## Examples

- Given the Acme example and Sam's email as the input,
  when Support reply runs in the engine,
  then it waits at the step Approve this reply? with `approve` and `reject`, and `halonic runs` lists the run.
- Given that waiting run,
  when the engine is closed and another one opened on the same workspace, and `approve` is sent,
  then the run finishes with the reply approved.
