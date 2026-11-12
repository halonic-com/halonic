# cli.local-engine

- Status: active
- Since: 0.1.0
- Source: HAL-3814 (plan for `halonic run`, PR D, approved by Liam on HAL-3895); an engine over more than one version from HAL-6084 (plan approved by Liam); each run's connectors from HAL-6277 (conditions from Liam on HAL-6290)

The CLI shall run a workspace's workflows in an engine in its own process, on the workspace's run store, blob store and records in the person's profile folder, never in the workspace, so `halonic runs` and the Studio see the runs it starts. A run's timers shall be kept in the workspace's records, so a run that waits on a timer goes on in the next engine opened on that workspace. A new run shall start with the workspace's definitions of its hub as they are now (`workspace.run-definitions`). Its model calls shall go to the workspace's models (`cli.workspace-models`). An engine opened over the versions of a workspace, as `routines watch`'s is, shall start each new run with the definitions of the version the run records (`engine.run-records-its-version`), start none when that version can't give them, and take model calls, chat agents and their connectors' tools from the version it read last. Each top-level run shall start the connectors its hub can see in the folder its programs start in: a copy of the workspace at the run's commit when it reads the live version, the workspace folder when it reads the saved files (`engine.run-connectors`, `app.runs-read-latest-version`). Its child runs shall call the same ones. They shall start with the grant of the command's trust check, so a workspace that isn't trusted starts no connector program, and they shall be closed, and the copy released after them, when the run ends or the engine closes. Each shall be marked local or not as its connector file says, and a run of a local-only workspace shall start only the local ones (`engine.local-only`). A connector that fails to close, or a leftover copy that can't be swept, shall be shown only in a `--debug` line, and shall never stop the command, however often it happens. Sending shall be off for every connector, because the CLI keeps no connector settings yet. An engine over the versions of a workspace shall start no run's connectors yet: a step that needs one fails with an error saying so. In 0.1 the engine shall offer no Halonic tools and no harnesses.

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
- Given a workspace in git whose committed notes connector script answers "the live script", and a saved change to it that isn't committed,
  when a run of the live version calls the connector's tool,
  then the committed script answers, never the saved change.
- Given that run,
  when it ends,
  then its connector program has stopped and its copy of the workspace is gone.
- Given that engine, whose version read last gives the agent Helper the model `local`,
  when Helper's run calls its model,
  then the call goes to `local`.
