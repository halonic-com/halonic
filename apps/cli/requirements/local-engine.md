# cli.local-engine

- Status: active
- Since: 0.1.0
- Source: HAL-3814 (plan for `halonic run`, PR D, approved by Liam on HAL-3895); an engine over more than one version from HAL-6084 (plan approved by Liam)

The CLI shall run a workspace's workflows in an engine in its own process, on the workspace's run store, blob store and records in the person's profile folder, never in the workspace, so `halonic runs` and the Studio see the runs it starts. A run's timers shall be kept in the workspace's records, so a run that waits on a timer goes on in the next engine opened on that workspace. A new run shall start with the workspace's definitions of its hub as they are now (`workspace.run-definitions`). Its model calls shall go to the workspace's models (`cli.workspace-models`). An engine opened over the versions of a workspace, as `routines watch`'s is, shall start each new run with the definitions of the version the run records (`engine.run-records-its-version`), start none when that version can't give them, and take model calls, chat agents and their connectors' tools from the version it read last. In 0.1 the engine shall offer no Halonic tools, no connectors and no harnesses.

## Examples

- Given the Acme example and Sam's email as the input,
  when Support reply runs in the engine,
  then it waits at the step Approve this reply? with `approve` and `reject`, and `halonic runs` lists the run.
- Given that waiting run,
  when the engine is closed and another one opened on the same workspace, and `approve` is sent,
  then the run finishes with the reply approved.
- Given an engine over the versions of the Acme workspace,
  when Support reply starts with `version: { reads: "live-version", commit: "4f2a…", versionDate: … }`,
  then it starts with the definitions of that version.
- Given that engine, whose versions can't give that version's definitions,
  when Support reply starts,
  then it fails with their error and no run is stored.
- Given that engine, whose version read last gives the agent Helper the model `local`,
  when Helper's run calls its model,
  then the call goes to `local`.
