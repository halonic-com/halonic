# assistant.home.chat-look

- Status: active
- Since: unreleased
- Source: HAL-20747; HAL-20728 conversation parts; HAL-20617 build plan

When Home's content pane shows a Build chat, the Assistant shall draw it with the new design's conversation parts, in light and dark alike: the kit's chat header (`ContentHeader`) with the Build mark on a 40px tile, the chat's title as the level-2 heading and, once the chat has a message, ⋮ at the end (a new chat has no ⋮ until its first message); the person's messages in the kit's own-message bubble; and the kit's floating message box. While the chat is renamed, the rename field shall replace the whole header, the mark and ⋮ included, at the header's height and with its shadow.

## Examples

- Given Home's pane shows "Triage",
  when it is drawn in light or dark,
  then the header is the 64px chat header titled "Triage" with ⋮, the person's message sits in its bubble and the message box floats under the chat.
- Given Home's pane shows "Triage",
  when the person picks Rename in ⋮,
  then the rename field replaces the header, mark and ⋮ included, at the same height.
- Given Home's pane shows a new chat with no message yet,
  when it is drawn,
  then the header shows the mark and "New chat" without ⋮.
