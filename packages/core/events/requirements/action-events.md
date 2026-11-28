# events.action-events

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers, the board's decision on HAL-10, 24 Nov 13:01 UTC), the architecture note on HAL-17491 with Julian's finding on 4.2 (an allow-list, not a deny list) and Liam's on the event log's placement; ADR `docs/adr/2026-11-24-action-sender.md`; task HAL-17516

The events package shall have the action events `action.requested`, `action.reviewed` (opened, declined or blocked by the user's policy), `action.signed-in`, `action.step.started`, `action.step.succeeded`, `action.step.failed`, `action.step.skipped` and `action.finished`, each with the request's id and the time, and shall have a check that takes an event only when every field is on its kind's allow-list and holds what the list says. Request parameters, expected state and kept answer fields shall be records of plain values under plain field names, at most 50 of them, where a kept answer field's name may also be up to 3 plain names joined by `.`, such as `triggering_actor.login`; a requester shall carry only the fields of its kind; and a service's error message shall be at most 300 characters. So no event can carry a token, a header, a value the user typed into an `input` step or a whole answer body. A problem the check reports shall name the field and never its value. These events shall not be run events: `action.requested` joins the run log when the engine's filing lands.

## Examples

- Given a valid event of any action kind with an added `authorization`, `token`, `headers`, `input`, `body`, `answer` or `cookie` field,
  when it is checked,
  then it is refused with that field "not allowed".
- Given a request whose parameters hold an object, or a step result whose kept fields hold a list, a text over 1,000 characters or a name such as `x-header`,
  when it is checked,
  then it is refused.
- Given a step result that keeps `triggering_actor.login`, or one that keeps `a.b.c.d` or `pull_requests.0`, or a request whose parameters name `repo.owner`,
  when it is checked,
  then the first is taken and the others are refused.
- Given a requester of kind `user` with a `token` field,
  when it is checked,
  then it is refused.
- Given a failed step whose error message is 301 characters long,
  when it is checked,
  then it is refused.
- Given one valid event of each of the eight kinds,
  when they are checked,
  then each is taken as it is.
