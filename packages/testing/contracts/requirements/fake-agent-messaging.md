# contracts.fake-agent-messaging

- Status: active
- Since: unreleased
- Source: HAL-17422 breakdown (rev 6): every Studio track builds against a fake until the Paperclip provider lands; ADR `docs/adr/2026-11-24-agent-messaging.md`; task HAL-17425

The `FakeAgentMessaging` shall be an `AgentMessaging` that runs in the process, so Studio's Inbox, Messenger and overview can be built and tested before any provider exists. A test shall be able to add sources, agents, conversations, messages, inbox items and work, answer an item as another client would, cut and restore a source's line, and sign a source out. It shall keep the items of two sources apart, keep the project an item was added with, answer an open item once and report an item already answered with who answered it, mark a conversation as waiting for the person when its agent wrote last, and tell a reader which source changed. Offline, it shall give a source's items as they were when the line was cut, with the source offline as of its last read, and refuse every write to it with `offline` without sending it later.

## Examples

- Given two sources that each have an agent named Chief,
  when the agents are listed,
  then there are two, each with its own source and ID.
- Given items in the projects Website and Billing and one with no project,
  when the items are listed and kept to Website,
  then only the Website item is left, and the item with no project has none.
- Given an item another client answered,
  when the person answers it,
  then the result is `already-answered` with that client.
- Given a source last read at 10:00 whose line was cut at 14:05,
  when its sources are listed and one of its items is answered,
  then it is offline as of 10:00, and the answer is `refused` with `offline` and is still not sent once the line is back.
- Given a signed-out source,
  when one of its items is answered,
  then the result is `refused` with `signed-out`.
