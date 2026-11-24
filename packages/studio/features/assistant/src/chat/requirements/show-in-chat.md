# assistant.chat.show-in-chat

- Status: active
- Since: unreleased
- Source: HAL-16804 (T14 PR 13); req-assistant U58 (HAL-110); flow-assistant 2.2 and 5.7 (HAL-647); UX checklist T14 (HAL-1361)

When the person picks "Show in chat" in the ⋮ of an agent or a workflow, on its overview row or its page, the Studio shall put that item in the Build chat the Assistant panel shows, else in a new Build chat, without adding it twice, shall open a closed panel on that chat while focus stays where it was, and shall tell the model the items shown with each message the person sends in that chat.

The panel shall show the chat's shown items under the status line as chips: the kind's icon, the name as a button that opens the item, and a button named "Remove *name* from this chat"; after three chips, a "+*n*" button shall open a menu of the rest. Skills, knowledge, connectors and other kinds shall have no "Show in chat".

## Examples

- Given no Build chat is open, when the person picks "Show in chat" on agent "Triage",
  then the panel opens on a new Build chat with "Triage" shown, and focus stays on the page.
- Given "triage" is already shown in that chat, when they pick "Show in chat" on it again,
  then it is not added twice.
- Given workflow "triage" is shown, when the person sends "Add a step",
  then the model is told that workflow "triage" is shown, and the note isn't kept in the chat.
- Given four items are shown, then three chips show and "+1" opens a menu with the fourth.
- Given the chip "triage", when the person presses "Remove triage from this chat",
  then the chip goes and the next message doesn't name it.
- Given a skill row, then its ⋮ has no "Show in chat".
