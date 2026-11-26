# workspace.reopen-gives-way

- Status: active
- Since: unreleased
- Source: HAL-19958 (the board's Studio ignored Open folder and Recent while it reopened its workspace at start); builds on `studio.window-content` (HAL-19734)

While the window reopens by itself, at start, the workspace it showed, the Welcome screen shall show that workspace's Recent row opening, with the step it waits on, and **Open folder** and the other Recent rows shall still work. When the person opens another folder meanwhile, that folder shall open and show, and the reopened workspace shall not show: once it has opened it shall close again. When the person opens the same workspace meanwhile, it shall open once, when the reopen ends.

## Examples

- Given Studio's window showed Acme at the last quit, and Acme's engine still starting,
  when Halonic starts again,
  then Welcome shows Acme's Recent row opening.
- Given Studio still reopening Acme at start,
  when the person presses **Open folder** and picks Beta,
  then the window shows Beta, and Acme doesn't show.
- Given Studio still reopening Acme at start,
  when the person opens Beta's Recent row,
  then the window shows Beta, and Acme doesn't show.
