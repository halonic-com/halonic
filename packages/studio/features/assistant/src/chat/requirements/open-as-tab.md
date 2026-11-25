# assistant.chat.open-as-tab

- Status: active
- Since: unreleased
- Source: HAL-16803 (T14 PR 12); flow-assistant 1, 2.3 and 5.7 (HAL-647); states H6 (HAL-5896); UX checklist T14 part 1 (HAL-1361)

The panel's header shall have **Open as tab** (⧉) after New chat. Pressing it shall move the chat to a tab and close the panel; the chat shall then be in one place only, so the panel opens on another chat, and picking it in the panel's chat menu switches to its tab. The tab shall show the chat on the left, its title as the rename field with "CHAT" before it, ⋮ with Delete chat…, **Continue in the side panel**, and a side panel for the items the chat shows, closed until the chat shows one. Opened while nothing is shown, the side panel shall say "Items the assistant shows or changes appear here." with the hint "Alt+click an agent or workflow in the sidebar to show it.". Show in chat while the chat's tab is active shall put the item in that chat. **Continue in the side panel** shall show the chat in the panel and close its tab, and deleting the chat shall close its tab. Shown items shall go along both ways. Closing the tab with × shall leave the chat a tab chat, so picking it in the panel's chat menu opens its tab again. **Chat with** in a tab shall open the new chat in a tab of its own and keep this one; if the new chat can't be started, it shall say why.

## Examples

- Given the panel shows "Add a routine" with "triage" shown,
  when the person presses Open as tab,
  then the panel closes, a tab "Add a routine" opens, and its side panel lists "triage".
- Given that tab,
  when the person presses Continue in the side panel,
  then the panel shows "Add a routine" with "triage" shown, and the tab closes.
- Given a chat tab with nothing shown,
  when the person opens its side panel,
  then it says "Items the assistant shows or changes appear here." and "Alt+click an agent or workflow in the sidebar to show it.".
