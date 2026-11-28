# engine.request-action-cap

- Status: active
- Since: unreleased
- Source: task HAL-20269, from Liam's review of PR #6719 (HAL-17529) and the 0.2.0 release review's finding on HAL-20857: `request_action` has risk `read`, so no approval stops an agent that files request after request

When a run's agent calls `request_action` and the run's stored log already holds 10 `action.requested` events, the tool shall fail with a message that says the run filed the most requests one run may file, and shall write nothing. The count shall include the requests of every model call and subagent of the run, so a new model call doesn't start again at 0.

When an agent makes several `request_action` calls at once, the tool shall check and file them one at a time, so together they file no more than the cap allows.

## Examples

- Given a run that filed 9 requests,
  when its agent files one more,
  then the request is filed.
- Given a run that filed 10 requests in an earlier model call,
  when its agent files another,
  then the call fails with "the most one run may file", and nothing is written.
- Given a run that filed none,
  when its agent makes 12 calls at once,
  then 10 are filed and 2 fail.
