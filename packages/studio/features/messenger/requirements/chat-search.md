# messenger.chat-search

- Status: active
- Since: unreleased
- Source: the Messenger look and layout changes approved by the board on HAL-10 (26 Nov, 03:51 UTC) and HAL-19132 (point 6), Sofia's sketches A and C on HAL-19134; built on HAL-19141

The Messenger shall show a search icon at the top right of its list, beside **New ▾**, and no search field above the list. When the person presses the icon, or Ctrl+K (Cmd+K on macOS) while the Messenger shows, the Messenger shall open a search field in the icon's place and put focus in it; Ctrl+K shall not open the Studio's command palette there. While the field holds text, the list shall show only the chats whose name or messages hold it, ignoring case, each with the line that holds it and the text marked, and say how many it found ("4 chats", or "No chat matches."). Escape shall close the search, show every chat again and put focus back on the icon.

## Examples

- Given chats with Chief, whose newest message says "Send preview.98 to the board's phone?", and with Liam, who never wrote "preview",
  when the person presses Ctrl+K and types "preview",
  then the list shows only Chief's chat with "Send preview.98 to the board's phone?", "preview" marked, and says "1 chat".
- Given the same search,
  when the person presses Escape,
  then both chats show again and focus is on the search icon.
