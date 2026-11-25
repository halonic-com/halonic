# paperclip-client.team-runs

- Status: active
- Since: unreleased
- Source: Runs app build plan (HAL-18624, approved on HAL-18629); the activity panel's fields (HAL-18628); task HAL-18650

The Paperclip provider shall serve `TeamStatus.runs` for one connection with `GET` requests only, each on its fixed request list and pinned to its path: the live runs from `live-runs`, the finished runs from `heartbeat-runs` (asked for with `agentId` and `limit` only, and only when the query has a `since` bound), and each run's task identifier and title from `getTask`, read once per task. A run shall carry only the port's fields, never the answer's output excerpts, log reference, wake context or error text. A run shall be stoppable only when it is queued or running and Paperclip says it can be stopped. When the query names an agent, only that agent's runs shall be returned, and an agent of another connection shall get no answer and send no request. When `heartbeat-runs` returns as many runs as asked for, all after the bound, the answer shall say it is not complete.

## Examples

- Given the provider's request list,
  when its run rows are read,
  then they are exactly `GET live-runs` and `GET heartbeat-runs`, and a run's cancel, log or events route matches none.
- Given a running run and two of today's finished runs for Ada, one on a task and one chat-only,
  when Ada's runs since midnight are read,
  then the running run comes first and can be stopped, the finished runs follow newest first, the task carries `ACME-7` and its title, and the chat-only run has no task.
- Given runs whose answers carry output excerpts and error text,
  when they are read,
  then none of that text is in the answer.
- Given 200 finished runs all after the bound,
  when they are read,
  then the answer is not complete.
