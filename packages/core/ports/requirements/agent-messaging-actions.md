# ports.agent-messaging-actions

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers, the board's decision on HAL-10, 24 Nov 13:01 UTC); Liam's OK on HAL-17533 (point 3 and its minors: an allow-list and the ended-run case for the answer); ADR `docs/adr/2026-11-24-action-sender.md` and `docs/adr/2026-11-24-agent-messaging-port-version-3.md`; task HAL-17575; dotted kept names, task HAL-20294

The `AgentMessaging` port shall be at version 3 or later and shall have action items: an inbox item that carries a request to run a user-only action stepper, made of the definition, its version, its parameters as plain values, the optional expected state and the expiry, and never a step, a method, an address, a header or a body. It shall have an `action-result` answer that holds how the request ended and, for each step the stepper reached, its outcome, its HTTP status, the kept fields of a success and, for a failure, why and the service's error text, at most 300 characters and marked untrusted. The answer shall hold no account name.

The ports package shall have a check that takes an `action-result` answer only when every field is on its allow-list and holds what the list says, with kept fields as plain values under the names `isActionKeptName` allows (a plain name, or up to 3 of them joined by `.`) and `kept`, `failure` and `error` only on the step outcome they belong to, the failure reasons and outcomes those of the action events, steps in ascending order each at most once, no steps for a declined or expired request and no failed step for a request that succeeded; a problem it reports shall name the field and never its value. It shall have a rule that an action item takes only an `action-result` answer that passes the check and any other item only an option or a reply, and every `AgentMessaging` shall refuse an answer that doesn't fit its item with `bad-answer` before sending anything.

## Examples

- Given an `action-result` answer with an `account` field at its top or in a step,
  when it is checked,
  then it is refused with that field "not allowed".
- Given an `action-result` answer whose step carries a `token`, `headers` or `body` field, or kept fields holding an object,
  when it is checked,
  then it is refused.
- Given a failed step whose error text is 301 characters long, or isn't marked untrusted,
  when it is checked,
  then it is refused.
- Given a succeeded step with a `failure`, or a failed step with kept fields,
  when it is checked,
  then it is refused.
- Given a declined or expired answer with steps, a succeeded answer with a failed step, or steps that repeat or go backwards,
  when it is checked,
  then it is refused.
- Given a succeeded step that keeps `triggering_actor.login`,
  when it is checked,
  then it is taken; one that keeps `pull_requests.0` or `a.b.c.d` is refused.
- Given a request that succeeded in two steps, one skipped, or one declined with no steps,
  when it is checked,
  then it is taken as it is.
- Given an action item and a reply, or a question and an `action-result` answer,
  when it is asked whether the answer fits,
  then it doesn't.
