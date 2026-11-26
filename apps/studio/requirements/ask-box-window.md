# studio.ask-box-window

- Status: draft
- Since: unreleased
- Source: HAL-19004, plan approved on that task; the window in `studio.src-tauri.quick-ask-window`; the box in `quick-ask.box`

When the desktop app's page loads in the window the shell labelled `ask`, it shall show only quick ask's box, for the workspace Studio last had open, the first in Recent, and start only the Quick Ask and Messenger features. The page in that window shall not open the workspace as the other focused apps' windows do: it shall read the host settings for the active account, ask through the agent host, and call no native command but `reopen_folder`, `host_settings_read`, `agent_host_request`, `plugin:quick-ask|hide`, `plugin:quick-ask|open_chat` and `show_main_window`. The page in that window shall open no engine, send no desktop notification, and tell the agent host nothing about the window's focus. When Recent holds no workspace, or one the page can't open, the window shall say "Open Halonic to choose a workspace." with an "Open Halonic" button that calls `show_main_window`, and the console shall say why it couldn't open.

## Examples

- Given Acme first in Recent and a chat with Chief,
  when the page loads in the window labelled `ask`, the person asks Chief "Where are we?" and presses Esc,
  then it called only `reopen_folder`, `host_settings_read`, `agent_host_request` and `plugin:quick-ask|hide`.
- Given the box showing,
  when the window loses the focus and gets it again,
  then the agent host isn't told about either.
- Given nothing in Recent,
  when the page loads in the window labelled `ask`,
  then it says "Open Halonic to choose a workspace."
  and pressing its "Open Halonic" button calls `show_main_window`.
