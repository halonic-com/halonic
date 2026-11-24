# assistant.chat.agent-orb

- Status: active
- Since: unreleased
- Source: HAL-17343; flow-assistant 5.3, 5.5 and 6.1 (HAL-647); flow-agents 4.2 and 4.3 (HAL-329); UX checklist T14 1.4 and 1.12 (HAL-1361)

The Assistant shall show each agent with its character, the kit's `AgentOrb` in the agent's own `character.colors` or else the pair its id picks: at 16px before the agent's name in the **Chat with** menu and before an agent chat's title in the recent chats. An agent chat shall show, at the top of the chat, the agent's 24px orb, its name and its state words: "thinking…" while it answers with no text yet, "using *tool*…" while a tool runs, "replying…" once its reply has text, else "idle", the orb's ring following the state. An empty agent chat shall show the agent's 64px orb above "Chat with *agent*" and its description; an empty Build chat shows none.

## Examples

- Given agent "Triage" with the colours `#3B82F6` and `#8B5CF6`,
  when the person opens **Chat with**,
  then "Triage" has a 16px orb in those colours.
- Given an empty chat with "Triage",
  when the panel shows it,
  then it shows Triage's 64px orb, "Chat with Triage", and the 24px orb with "Triage idle" at the top.
- Given a chat with "Triage" whose answer has no text yet,
  when it is shown,
  then the top line reads "Triage thinking…" and the orb's ring is dashed.
- Given a chat with "Triage" running the tool `acme-mail__send_reply`,
  when it is shown,
  then the top line reads "Triage using send reply…".
