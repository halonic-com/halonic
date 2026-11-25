# messenger.conversations

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md` (features 5 and 7, and the HAL-17421 renders); Julian's security review HAL-17436 (finding 3); HAL-17442. Drafted as `studio.messenger` and moved here with the feature that holds it.

The Messenger shall show one conversation per agent from `AgentMessaging`, newest first, each telling apart conversations from different sources by its source's label (`messenger.chat-rows`), and the open conversation's header shall show its source's label and its agent's activity (idle, working, waiting or paused). It shall list them under the tabs "All" and "Waiting for me", where "Waiting for me" lists only the conversations whose agent wrote last. It shall send a message through `AgentMessaging.send` and show it in the conversation. While the conversation's source is offline or signed out, it shall keep the typed text as a draft and send nothing. It shall find a conversation's messages by the text they hold. It shall render messages with no raw HTML, scripts or `javascript:` links, open links outside the app, load no image on its own, and never treat a message as a Halonic command.

## Examples

- Given two sources that each have an agent named Chief,
  when the Messenger is opened,
  then it shows two conversations named Chief, each with its source's label, and an open one's header says "Paperclip · Acme · Waiting".
- Given a conversation whose agent wrote last and one where the person wrote last,
  when "Waiting for me" is chosen,
  then it lists only the first.
- Given the board's chat with Chief on the Paperclip source,
  when the board sends "Morning" in Chief's conversation,
  then the message is sent through `AgentMessaging.send` and shows in the conversation.
- Given Chief's source is offline,
  when the board types "Morning" and sends it,
  then nothing is sent and "Morning" stays in the box.
- Given a message holding `<script>alert(1)</script>` and a link to `javascript:alert(1)`,
  when the conversation shows it,
  then both show as plain text: no script element and no link.
