# contracts.fake-agent-messaging-channels

- Status: active
- Since: unreleased
- Source: the board's approval of the phase 2 card (HAL-17544, 24 Nov); architecture note 1.2 (HAL-17511); ADR `docs/adr/2026-11-24-agent-messaging.md`, "Version 4"; task HAL-17624

The `FakeAgentMessaging` shall serve channels as a provider must, so the Messenger can be built against it before any provider has them. It shall start a channel only with 2 to 8 agents of one source with the lead among them, and refuse any other with `bad-members`. It shall send a message only to agents in its conversation, refusing a `to` that names anyone else with `not-found` without sending it, and shall record every message it sends with the author `me` and the `to` it was given. It shall set a channel's members by the same rule, list a channel the person left in `browseChannels` and not in `listConversations` until they join it again, and refuse a channel call for an ID that isn't a channel with `not-found`, offline with `offline`, and every channel call with `not-supported` when it plays a source without channels. It shall list a message's work lines as it was given them, a failed line's reason included (HAL-18156).

## Examples

- Given a channel with Chief and Liam,
  when a message is sent with `to` naming Elena, who isn't in it,
  then the result is `refused` with `not-found` and the channel has no new message.
- Given a channel with Chief and Liam,
  when a message is sent with `to` naming Liam,
  then it is recorded with the author `me` and `to` Liam.
- Given agents of Acme and one of Globex,
  when a channel is started with 1 agent, with 9 agents, or with agents of Acme and Globex,
  then each is `refused` with `bad-members` and no conversation is added.
- Given a channel the person is in,
  when they leave it and then join it,
  then it moves from the conversations to `browseChannels` and back.
- Given a message whose work line for Elena failed with the reason "Build broke",
  when the channel's messages are listed,
  then that line is `failed` with the reason "Build broke".
- Given a fake that plays a source without channels,
  when a channel is started,
  then the result is `refused` with `not-supported`.
