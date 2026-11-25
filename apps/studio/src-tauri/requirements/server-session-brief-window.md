# studio.src-tauri.server-session-brief-window

- Status: draft
- Since: unreleased
- Source: HAL-18014; Liam's security review of HAL-17843, item 1; plan on HAL-17834, section 4

When `server_session_open` is about to start Claude Code on macOS or Linux, the shell shall first ask in its own window titled "Start Claude Code on your server?", which shows the user, the host and the task, the whole brief unchanged in a read-only box that scrolls, and the buttons Cancel and Start. The window's page shall be written by the shell, served from the shell's own scheme to that window only, and hold no script, and no capability shall name the window, so its page can call no command. The shell shall answer Start only for the window's Start link, load nothing the links point to, and answer Cancel when the person presses Cancel, closes the window, or the window can't open. Only one such window shall be open at a time.

## Examples

- Given a brief near 8 KB that holds `</textarea>`, `<script>`, `&amp;` and quotes,
  when the window shows it,
  then the box holds the brief exactly as written and the page has no script.
- Given the brief window is open,
  when the person closes it,
  then the command answers `cancelled` and writes nothing.
- Given the brief window's page,
  when it calls any command,
  then the call is refused.
