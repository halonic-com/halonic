# shell.studio-mount

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 16b; AGENTS.md "thin commands and screens"

The shell shall draw one Studio window (`shell.studio-window`) into an element of the page the app gives it, so that the app starts the Studio without using React itself. When the app unmounts the window, the shell shall remove everything it drew from that element.

## Examples

- Given a workspace with no features,
  when the app mounts the Studio window into its `#root` element,
  then the element shows the window tabs and Home.
- Given a mounted Studio window,
  when the app unmounts it,
  then the element is empty.
