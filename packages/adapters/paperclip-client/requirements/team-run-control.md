# paperclip-client.team-run-control

- Status: active
- Since: unreleased
- Source: Runs app build plan (HAL-18624); PR 3 plan approved by the maintainer on HAL-18699; design HAL-18594 revision 3 (Stop and Run again); task HAL-18695

The Paperclip provider shall serve `TeamRunControl` for one connection. Before every call it shall read the run again with `getRun` and keep only its company, agent, task and whether Paperclip can stop it now, and shall treat a run of another company or another connection as not found, sending no write. Stop shall send `cancelRun`, with no body, only while the run is queued or running and Paperclip says it can stop. Run again, and the check for offering it, shall read the run's task with `getTask` and go ahead only while the task belongs to the connection's company, isn't done or cancelled, and is still assigned to the run's agent; Run again shall then wake the agent through the `wakeTask` row with its fixed comment. A task with someone else shall name the agent holding it by its display name only, and a person holding it not at all. A refusal shall be one of the port's codes, never Paperclip's text.

## Examples

- Given the provider's request list,
  when its run control rows are read,
  then they are `GET /api/heartbeat-runs/:run` and `POST /api/heartbeat-runs/:run/cancel` with no body, and a run ID that isn't a UUID is refused before any request.
- Given a running run that Paperclip can stop,
  when it is stopped,
  then one cancel request is sent and the answer is stopping.
- Given a run that could stop when the list was read but can't any more,
  when it is stopped,
  then no cancel request is sent and the answer is refused as not stoppable.
- Given a failed run whose task is open and still with its agent,
  when it is run again,
  then the task is assigned to that agent with status `todo` and the fixed comment.
- Given a task that was done after Run again was offered,
  when it is run again,
  then no wake request is sent and the answer is refused as task done.
- Given a task that is with Bo now,
  when Run again is checked,
  then it isn't offered, with the task's short name and "Bo".
