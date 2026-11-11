# shell.window-title

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 16d; Sofia's UX check of #1713 (HAL-5329); HAL-5401

While a Studio window shows, the shell shall keep the page's title as the title of the page shown (the active tab's on the desktop, the phone place's page on a phone), the workspace's name and "Halonic", joined by " · ", such as "Home · Acme · Halonic". When the window doesn't know the workspace's name, or the name is empty, the title shall leave it out. The title shall follow tab switches, Back and Forward, renames of the active tab on the desktop, moves on the phone, and the window crossing the phone width.

## Examples

- Given a new workspace named "Acme",
  when the window shows,
  then the page's title is "Home · Acme · Halonic".
- Given a workspace with no name yet,
  when the window shows,
  then the page's title is "Home · Halonic".
- Given a workspace whose name is empty,
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
- Given the active tab on _Support reply_ and the phone on Home,
  when the window narrows to a phone's width,
  then the page's title is "Home · Acme · Halonic"; after a tap on More, "More · Acme · Halonic"; when the window widens again, "Support reply · Acme · Halonic".
