# studio.fixed-window

- Status: active
- Since: unreleased
- Source: the board's request on HAL-20556 (there should not be a window scrollbar, as the layout is fixed)

Studio's window and each focused app's window (the Messenger, the Inbox) shall never scroll as a whole and shall never show a window scrollbar. The window's layout shall fill the window, and each of its regions, such as the sidebar's rows, the page, a thread or a side panel, shall scroll on its own (`shell.sidebar-scroll`, `messenger.chats-scroll`). Content that overflows its region by mistake shall be cut off at the window's edge rather than make the window scroll.

## Examples

- Given the Studio page's CSS,
  when it is built,
  then the document, its body and the app's root fill the window's height and hide their overflow.
