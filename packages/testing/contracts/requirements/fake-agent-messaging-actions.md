# contracts.fake-agent-messaging-actions

- Status: active
- Since: unreleased
- Source: ADR `docs/adr/2026-11-24-agent-messaging-port-version-2.md`, so the stepper and the Inbox change build against the fake; task HAL-17575

The `FakeAgentMessaging` shall let a test add an action item, which offers no options unless told otherwise. It shall answer an action item once with an `action-result` answer and report `already-answered` with who answered it for any later answer, and it shall refuse with `bad-answer`, leaving the item open, an answer that doesn't fit its item: an option or a reply to an action item, an `action-result` to any other item, or an `action-result` that fails its allow-list.

## Examples

- Given an open action item,
  when it is answered with an `action-result` and then answered again,
  then the first result is `answered`, the second is `already-answered` by the person, and the item holds the first answer.
- Given an open action item,
  when it is answered with a reply, or with an `action-result` that names an account,
  then the result is `refused` with `bad-answer` and the item is still open.
- Given an open question,
  when it is answered with an `action-result`,
  then the result is `refused` with `bad-answer`.
