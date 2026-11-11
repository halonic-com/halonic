# shell.window-title

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 16d; Sofia's UX check of #1713 (HAL-5329)

While a Studio window shows, the shell shall keep the page's title as the active tab's title, the workspace's name and "Halonic", joined by " · ", such as "Home · Acme · Halonic". When the window doesn't know the workspace's name, the title shall leave it out. The title shall follow tab switches, Back and Forward, and renames.

## Examples

- Given a new workspace named "Acme",
  when the window shows,
  then the page's title is "Home · Acme · Halonic".
- Given a workspace with no name yet,
  when the window shows,
  then the page's title is "Home · Halonic".
- Given the active tab on Home,
  when the user opens the Inbox in it,
  then the page's title is "Inbox · Acme · Halonic"; after Back, "Home · Acme · Halonic".
- Given a second tab on _Support reply_,
  when the user switches to it,
  then the page's title is "Support reply · Acme · Halonic".
- Given the active tab on _Support reply_,
  when the item is renamed _Refund reply_,
  then the page's title is "Refund reply · Acme · Halonic".
