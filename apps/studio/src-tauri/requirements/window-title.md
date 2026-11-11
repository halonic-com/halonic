# studio.src-tauri.window-title

- Status: draft
- Since: 0.1.0
- Source: HAL-5401, follow-up to HAL-1290 (`shell.window-title` in `@halonicjs/studio-shell`)

When the page in the app window changes its title, the shell shall show that title as the window's native title, which the task bar and the window switcher read. While the page has no title, or only spaces, the shell shall show "Halonic".

## Examples

- Given the Studio showing the Inbox of the workspace Acme,
  when the page's title becomes `Inbox · Acme · Halonic`,
  then the window's native title is `Inbox · Acme · Halonic`.
- Given a page whose title is empty,
  when it loads in the app window,
  then the window's native title is `Halonic`.
