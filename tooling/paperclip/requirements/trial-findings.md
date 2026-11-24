# paperclip.trial-findings

- Status: active
- Since: unreleased
- Source: HAL-17317; Chief and Seat Supervisor take over the board session's recurring duties and need the latest model-trial summaries without run data (follow-up to HAL-17280)

When an agent calls the Agent tools plugin's `trial_results` tool with `action: "findings"`, the plugin shall send one GET request to `/v1/findings?kind=<kind>` on the trial results service at the address in its settings, with `kind` as given (`all` when it is missing), the token from its settings' secret only in the `Authorization` header, and no other parameter, and answer with the service's JSON marked as data and cut to 120,000 characters; it shall answer with an error and send no request when no token is set, when `kind` isn't one of `live_daily`, `lab_decisions`, `seat_calibration`, `seat_burn`, `learnings`, `seat_lane` or `all`, or when the calling agent's url key isn't in its list of trial findings agents (Tomas, Elena, Liam, Chief and Seat Supervisor by default); and an agent in that list but not in the list of trial results agents shall get an error and no request for every other action.

## Examples

- Given a token and Chief calling `trial_results` with `action: "findings"` and nothing else,
  when the call runs,
  then the service gets `GET /v1/findings?kind=all` with `Authorization: Bearer <token>`, and the answer carries the service's JSON.
- Given Seat Supervisor calling with `action: "findings"`, `kind: "seat_burn"`, `variant: "V12"` and `include: "prompt"`,
  when the call runs,
  then the request is `GET /v1/findings?kind=seat_burn`, without `variant` or `include`.
- Given Chief calling with `action: "summary"` or `action: "run"`,
  when the call runs,
  then the answer is an error naming the trial results agents, and no request is sent.
- Given Priya, who is in neither list, calling with `action: "findings"`,
  when the call runs,
  then the answer is an error naming the trial findings agents, and no request is sent.
- Given a findings answer of 130,000 characters,
  when the call runs,
  then the agent gets the first 120,000 and a line saying where it was cut.
