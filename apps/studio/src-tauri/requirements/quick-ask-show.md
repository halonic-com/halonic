# studio.src-tauri.quick-ask-show

- Status: draft
- Since: unreleased
- Source: HAL-19411, part A of HAL-19400 (UX gap G6 from HAL-19383; plan approved by Liam on HAL-19400); the box's window in `studio.src-tauri.quick-ask-window`

When Studio's own window calls `plugin:quick-ask|show`, the shell shall show quick ask's box as the tray's Ask… does (`studio.src-tauri.quick-ask-window`): it shall open the box's window once, under the label `ask`, place it on the screen the pointer is on and give it the focus, and show the same window again after that. The command shall take nothing and answer nothing but success, or `failed`, with the reason in the shell's log, when the box can't show. The shell shall grant `plugin:quick-ask|show` only to Studio's window (`main`) and refuse it as `not_studio` from any other window, the box's, Halonic Inbox's and Halonic Messenger's included, with nothing opened. The served Studio shall not get it.

## Examples

- Given Studio's window open and the box never shown,
  when Studio's window calls `plugin:quick-ask|show`,
  then the box's window opens under the label `ask` and shows with the focus.
- Given the box shown once and hidden,
  when Studio's window calls `plugin:quick-ask|show` again,
  then the same window shows again, and no second one opens.
- Given Halonic Messenger's window,
  when it calls `plugin:quick-ask|show`,
  then it is refused as `not_studio` and no window opens.
- Given the box,
  when it calls `plugin:quick-ask|show`,
  then it is refused as `not_studio`.
