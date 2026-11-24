# agent-host.messaging-hub

- Status: active
- Since: unreleased
- Source: HAL-17422 plan and breakdown (rev 6), track A3a (HAL-17493); ADR `docs/adr/2026-11-24-agent-messaging.md` ("the engine joins every provider's sources into one `AgentMessaging`")

The agent host shall join every messaging provider, each an `AgentMessaging`, into one `AgentMessaging`. It shall merge their lists in the port's order: conversations and inbox items newest first, work newest change first, and a conversation's messages oldest first. It shall merge their search hits and their `changes`. It shall send an answer or a message only to the provider that listed the item or conversation, and refuse an ID that no provider listed with `not-found` without sending it to any provider. When one provider fails a read, the agent host shall still give the other providers' items and report that provider's failure, and when every provider fails it, the read shall fail.

## Examples

- Given two providers that each list an inbox item,
  when the inbox is listed,
  then both items come back, the newest first.
- Given an item listed by the second provider,
  when the person answers it,
  then only the second provider gets the answer.
- Given an ID no provider listed,
  when the person answers it,
  then the answer is `refused` with `not-found`, and no provider gets it.
- Given a first provider whose reads fail,
  when the inbox is listed,
  then the second provider's items come back and the first provider's failure is reported.
