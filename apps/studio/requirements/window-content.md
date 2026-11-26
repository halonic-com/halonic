# studio.window-content

- Status: active
- Since: unreleased
- Source: HAL-19734 (part D of HAL-19534's plan, approved on HAL-19566); the shell's side in `studio.src-tauri.open-windows`, the focused apps' windows in `studio.focused-app-window`

When an app window's page starts on the desktop, it shall read what the shell kept for its window with `window_content_get`, as JSON `{ "workspace"?, "chat"?, "item"? }` of strings, and shall read content that isn't a string, is over 2,048 bytes, isn't JSON, or has another shape, another field or a field of another type as nothing, and a refusal as nothing. Studio's window shall reopen the kept workspace only while the host setting `windows.reopen-on-start` isn't `false` (a setting that can't be read counts as on, as in the shell) and its location is in Recent, through the shell as its Recent row does; otherwise it shall show Welcome, and when the workspace can't open it shall show Welcome and the console shall say why. Stopping Studio's page shall not wait for a reopen still under way, and shall keep nothing once that reopen ends. A focused app's window shall open the kept workspace while its location is in Recent, else the first in Recent, as before. From then on the page shall keep the location of the workspace its window shows with `window_content_set`, one call at a time, each awaited before the next, only when it changed, and `null` when it shows none. It shall never send content over 2,048 bytes or cut it short: it shall keep `null` instead, so the window reopens on its start screen, and a refusal shall go to the console.

## Examples

- Given Studio's window showed Acme at the last quit, and Acme in Recent,
  when Halonic starts again,
  then Studio's window shows Acme.
- Given Studio's window showed Acme at the last quit, and Acme removed from Recent since,
  when Halonic starts again,
  then Studio's window shows Welcome.
- Given Studio's window showed Acme at the last quit, Acme in Recent, and "Reopen windows on start" off,
  when Halonic starts again,
  then Studio's window shows Welcome.
- Given the Inbox's window showed Beta at the last quit, and Acme first in Recent,
  when the Inbox's window opens again,
  then it shows the Inbox for Beta.
- Given the kept content `{"workspace": 7}`,
  when a window's page starts,
  then it reads nothing.
