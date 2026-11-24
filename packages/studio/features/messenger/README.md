# @halonicjs/studio-feature-messenger

The Messenger feature of the Studio: one conversation per agent, read from the engine's
`AgentMessaging` (ADR `docs/adr/2026-11-24-agent-messaging.md`), with the tabs "All" and "Waiting
for me". It sends through `AgentMessaging.send`, keeps a draft per conversation, and keeps the
draft unsent while the conversation's source is offline or signed out. It never sees a provider's
own types, IDs or addresses: it gets the port from `AgentMessagingService` in `studio/services`.

Messages are written by agents, so the kit's `ChatText` draws them: no raw HTML, scripts, images or
`javascript:` links, and web links open in the browser with their address shown.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-messenger` (the feature) and `@halonicjs/studio-feature-messenger/api` (`MessengerService`)
- **Requirement:** `messenger.conversations`

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
