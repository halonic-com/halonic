# server.end-user-run-limit

- Status: active
- Since: unreleased
- Source: HAL-14163 (S3-11), Liam's answer 1 on the plan, 26 Nov; HAL-19051; builds on `server.end-user-routes`, `server.run-access` and `events.run-limit-waiting`

Where the server is built for many users, the answer to the run's starter for `GET /api/runs/<id>` and `GET /api/waiting-runs` shall carry a run's plan stop as its summary gives it: `limit`, with its code and detail, while the run waits at a plan limit, and `cause` once it has failed. It shall never carry the input of its `run.limit-waiting`, which only the engine reads on `continue`. No new route serves a run's limit messages: the served Studio words them from these answers.

Rationale: the run messages of flow C3 come from the stop's code and detail (`app.run-plan-stop`), so the end user's answer must keep them; the refused input can hold the run's content, and the end user never needs it.

## Examples

- Given a run Alice started that waits at `plan.cost`,
  when she asks for `GET /api/runs/<id>`,
  then the answer has `limit` with the code `plan.cost` and its detail, and nothing of the refused input.
- Given that run,
  when she asks for `GET /api/waiting-runs`,
  then it is listed with its `limit`, and nothing of the refused input.
- Given a run of hers that failed when its wait ran out,
  when she asks for `GET /api/runs/<id>`,
  then the answer has `cause` with the code `plan.cost`.
