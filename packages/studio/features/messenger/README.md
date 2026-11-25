# @halonicjs/studio-feature-messenger

The Messenger feature of the Studio: one conversation per agent, read from the engine's
`AgentMessaging` (ADR `docs/adr/2026-11-24-agent-messaging.md`), with the tabs "All" and "Waiting
for me". It sends through `AgentMessaging.send`, keeps a draft per conversation, and keeps the
draft unsent while the conversation's source is offline or signed out. It never sees a provider's
own types, IDs or addresses: it gets the port from `AgentMessagingService` in `studio/services`.

Messages are written by agents, so the kit's `ChatText` draws them: no raw HTML, scripts, images or
`javascript:` links, and web links open in the browser with their address shown.

A channel is one conversation with several agents of one source. Its box says who a message goes
to: the lead, or the members the person picked with `@`, which become chips. Only a pick names an
agent; text is never read as a name or an instruction. Each message shows its author as the source
gives it, and the person's messages show one work line per agent they went to.

A channel's header shows its Members, where the person adds and removes agents and picks the lead,
and **Leave channel**, which asks once.
Before an agent is added to a channel with messages, the Messenger says the agent will read them,
and changes nothing until the person confirms.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-messenger` (the feature) and `@halonicjs/studio-feature-messenger/api` (`MessengerService`)
- **Requirements:** `messenger.conversations`, `messenger.channel-authority`, `messenger.author-from-source`, `messenger.channel-messages`, `messenger.members`

## Example

```ts
const messenger = services.get(MessengerService);
const waiting = await messenger.rows("waiting");
const chat = waiting[0];
if (chat !== undefined) {
  messenger.setDraft(chat.conversation.id, "On it");
  await messenger.sendDraft(chat.conversation.id, chat);
}
```
