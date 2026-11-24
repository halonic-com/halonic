# paperclip.trial-results

- Status: active
- Since: unreleased
- Source: HAL-17280; option (b) of HAL-17267 with Liam's design and Chief's access rules (HAL-17268): agents read model-trial results through a plugin tool, with no key and no database access

When an agent calls the Agent tools plugin's `trial_results` tool with an `action` of `variants`, `summary`, `paired`, `runs` or `run`, the plugin shall send one GET request to the trial results service at the address in its settings, with the token from its settings' secret only in the `Authorization` header, passing `variant`, `ref`, `batch`, `stage`, `set`, `task`, `limit` and `run_id` on as they came, `run_id` in the path for `run`, and `include` only for `run`, and answer with the service's JSON marked as data and cut to 20,000 characters; it shall answer with an error and send no request when no token is set, when the calling agent's url key isn't in its list of trial results agents (Tomas, Elena and Liam by default), or for an unknown action, a `run` without `run_id` or a parameter that is neither text nor a number; it shall turn the service's 400, 401 or 403, 404, 429 and other answers, and a service it can't reach, into an error that says what happened, with the service's reason for 400 and 404; and the token shall appear in no answer and no log line.

## Examples

- Given a token and Tomas calling `trial_results` with `action: "summary"`, `variant: "V12"` and `stage: "s2"`,
  when the call runs,
  then the service gets `GET /v1/summary?variant=V12&stage=s2` with `Authorization: Bearer <token>`, and the answer carries the service's JSON.
- Given `action: "summary"` with `include: "prompt"`,
  when the call runs,
  then the request carries no `include`; with `action: "run"` and `run_id: "r-42"` it goes to `/v1/run/r-42?include=prompt`.
- Given no token in the settings,
  when any agent calls `trial_results`,
  then it answers that the tool is off and sends no request.
- Given Priya, who isn't in the list,
  when she calls `trial_results`,
  then it answers with an error naming who may call it and sends no request.
- Given a service that answers 400 with `unknown parameter: colour`,
  when the call runs,
  then the answer is an error with that reason; a 401 is an error that says to tell the board, and is logged with its status only.
