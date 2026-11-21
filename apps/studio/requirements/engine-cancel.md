# studio.engine-cancel

- Status: active
- Since: unreleased
- Source: HAL-13434 (first-run build 6, **Cancel run**); first-run-flow 3.4 and 10.2 R7, approved by the board on HAL-7993

Where the Studio can start a run of the open folder's workflows, it shall also offer to cancel a run (`RunStartHost.cancelRun`), on the engine that runs the folder: the page's own engine, or the background engine (`POST /api/runs/{run}/cancel`). The page's own engine shall open as it does for a send (`studio.engine-service`), refusing as a send does a workspace that may start nothing or an engine another process holds, then end the run, and the child runs it waits on, as cancelled; the run's record shall stay. The cancel shall resolve once the run has ended, and reject with the engine's reason when it couldn't, such as a run the engine doesn't know.

## Examples

- Given a run of Support reply that is writing its reply,
  when the page cancels it,
  then the engine ends it as cancelled and the Runs list still has it.
- Given a workspace that may start nothing,
  when the page cancels a run,
  then it is refused as `denied`, and the engine's lock is given back.
- Given a folder whose workflows can't start a run, such as a served page with no engine,
  then the Studio offers no way to cancel one either.
