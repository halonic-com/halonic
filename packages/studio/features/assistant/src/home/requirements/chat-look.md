# assistant.home.chat-look

- Status: active
- Since: unreleased
- Source: HAL-20747; HAL-20728 conversation parts; HAL-20617 build plan

When Home's content pane shows a Build chat, the Assistant shall draw it with the new design's conversation parts, in light and dark alike: the kit's chat header (`ContentHeader`) with the Build mark on a 40px tile, the chat's title as the level-2 heading and ⋮ at the end; the person's messages in the kit's own-message bubble; and the kit's floating message box. While the chat is renamed, the rename field shall take the heading's place at the header's height.

## Examples

- Given Home's pane shows "Triage",
  when it is drawn in light or dark,
  then the header is the 64px chat header titled "Triage" with ⋮, the person's message sits in its bubble and the message box floats under the chat.
- Given Home's pane shows "Triage",
  when the person picks Rename in ⋮,
  then the rename field shows where the heading was.
