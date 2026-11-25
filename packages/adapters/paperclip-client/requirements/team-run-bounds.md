# paperclip-client.team-run-bounds

- Status: active
- Since: unreleased
- Source: review of halonic#6123 (HAL-18650), follow-ups on task HAL-18685

When `TeamStatus.runs` reads the runs' task names, the Paperclip provider shall send at most 50 `getTask` reads per call, at most 4 at a time, and shall read a task's name again once it is more than 10 minutes old. A task the key may not read (403) or can't find (404) shall keep its ID with no name. A run whose task ID can't be one path segment shall carry no task, and its task shall not be read. When the query's `since` isn't a time, the provider shall refuse the query before it sends any request.

## Examples

- Given 60 finished runs, each on its own task,
  when they are read,
  then at most 50 `getTask` reads are sent, never more than 4 at a time, and the other tasks keep their IDs.
- Given a task name read 11 minutes ago,
  when the runs are read again,
  then the task's name is read again.
- Given a task the key gets a 403 for,
  when its run is read,
  then the run's task has its ID and no name.
- Given a run whose task ID holds a space,
  when it is read,
  then the run has no task and no `getTask` read is sent for it.
- Given `since` set to `yesterday`,
  when the runs are read,
  then the read is refused and no request is sent.
