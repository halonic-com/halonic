# Decision: the chat-notes route is also read for progress notes

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19714 (Messenger shows the front bot's progress notes, from HAL-18847 section 2.2 and HAL-19704)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:tIvX6ecw/d9mpSn+4nXdIs4SEny4Dy/w6e+pc+o7XI8jZmRSosEgOxe/M7cRGcNqNQizgwRmI298WI/0U2y/CA==

The front bot's progress notes are never comments: the agent-tools plugin serves them on the
same `chat-notes` route (new requirement `paperclip-client.progress-notes`). So the provider can
no longer read that route only when a chat has a comment with no author. `paperclip-client.bot-notes`
now also reads it when the person wrote in the chat in the last day, the time the plugin keeps
progress notes. Marking the bot's comments doesn't change. Its "no read" test keeps its checks,
with the person's question a week old instead of minutes.

## Covers

- paperclip-client.bot-notes
